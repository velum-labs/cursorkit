// Package main provides a vendored tool to extract Protobuf definitions from
// the Cursor application. It processes Cursor's extensionHostProcess.js bundle,
// exposes service registries, and emits .proto files.
package main

import (
	"context"
	_ "embed"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const (
	defaultCursorPath = "/Applications/Cursor.app"
	defaultOutputDir  = "proto"
	extensionHostPath = "Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js"

	tempFilePattern = "cursor-rpc-*.js"
	tempDirPattern  = "cursor-rpc-extract-*"

	minAiServerServices = 10
	fallbackTimeout     = 100
	supportedOS         = "darwin"

	prettierTimeout   = 5 * time.Minute
	npmInstallTimeout = 5 * time.Minute
	nodeScriptTimeout = 2 * time.Minute
)

var (
	//go:embed preprocess.js
	PreProcess string

	//go:embed postprocess.js
	PostProcess string

	nlsErrorRegex = regexp.MustCompile(`throw new Error\(` + "`" + `!!! NLS MISSING: \$\{[a-zA-Z_][a-zA-Z0-9_]*\} !!!` + "`" + `\);`)

	initCallRegex = regexp.MustCompile(`[a-z]+ve\(\)\.catch\(\([a-z]\) => console\.log\([a-z]\)\);`)

	mainExecRegex = regexp.MustCompile(`J_t\(\)\.catch\([^)]*\);`)

	serviceRegistryRegex = regexp.MustCompile(`(\w+)\s*=\s*\{[^}]*\[\w+\.typeName\]\s*:\s*\w+`)
)

type Config struct {
	CursorPath string
	OutputDir  string
	Prettier   string
	Node       string
	Npm        string
	IsNightly  bool
	Logger     *log.Logger
}

type Extractor struct {
	config Config
}

func NewExtractor(config Config) *Extractor {
	return &Extractor{config: config}
}

func main() {
	logger := log.New(os.Stdout, "[cursor-rpc proto extractor] ", log.LstdFlags)

	if err := run(logger); err != nil {
		logger.Fatalf("Error: %v", err)
	}
}

func run(logger *log.Logger) error {
	if runtime.GOOS != supportedOS {
		return fmt.Errorf("unsupported platform: %s (only %s is supported)", runtime.GOOS, supportedOS)
	}

	cursorPath, outputDir, err := parseCLIArgs()
	if err != nil {
		return err
	}

	config, err := buildConfig(cursorPath, outputDir, logger)
	if err != nil {
		return err
	}

	extractor := NewExtractor(*config)
	return extractor.Extract()
}

func parseCLIArgs() (string, string, error) {
	args := os.Args[1:]
	if len(args) > 2 {
		return "", "", fmt.Errorf("usage: %s [cursor app path] [output dir]", os.Args[0])
	}

	cursorPath := defaultCursorPath
	if len(args) >= 1 {
		cursorPath = args[0]
	}

	outputDir := defaultOutputDir
	if len(args) == 2 {
		outputDir = args[1]
	}

	return cursorPath, outputDir, nil
}

func findBinary(name string) (string, error) {
	path, err := exec.LookPath(name)
	if err != nil {
		return "", fmt.Errorf("%s not found in PATH: %w", name, err)
	}
	return path, nil
}

func buildConfig(cursorPath string, outputDir string, logger *log.Logger) (*Config, error) {
	prettier, err := findBinary("prettier")
	if err != nil {
		return nil, err
	}

	node, err := findBinary("node")
	if err != nil {
		return nil, err
	}

	npm, err := findBinary("npm")
	if err != nil {
		return nil, err
	}

	absCursorPath, err := filepath.Abs(cursorPath)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve cursor path: %w", err)
	}

	absOutputDir, err := filepath.Abs(outputDir)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve output path: %w", err)
	}

	isNightly := strings.Contains(strings.ToLower(cursorPath), "nightly")

	return &Config{
		CursorPath: absCursorPath,
		OutputDir:  absOutputDir,
		Prettier:   prettier,
		Node:       node,
		Npm:        npm,
		IsNightly:  isNightly,
		Logger:     logger,
	}, nil
}

func (e *Extractor) Extract() error {
	extensionHostProcess := filepath.Join(e.config.CursorPath, extensionHostPath)

	if err := e.validateFile(extensionHostProcess); err != nil {
		return err
	}

	tempFile, err := e.copyToTempFile(extensionHostProcess)
	if err != nil {
		return err
	}
	defer os.Remove(tempFile)

	if err := e.formatWithPrettier(tempFile); err != nil {
		return err
	}

	content, err := e.processContent(tempFile)
	if err != nil {
		return err
	}

	outputPath, err := e.runNodeExtraction(content)
	if err != nil {
		return err
	}

	e.config.Logger.Printf("Successfully extracted protobuf definitions to %s", outputPath)
	return nil
}

func (e *Extractor) validateFile(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("failed to access extension host file: %w", err)
	}

	if info.IsDir() {
		return fmt.Errorf("expected file but found directory: %s", path)
	}

	return nil
}

func (e *Extractor) copyToTempFile(sourcePath string) (string, error) {
	source, err := os.Open(sourcePath)
	if err != nil {
		return "", fmt.Errorf("failed to open source file: %w", err)
	}
	defer source.Close()

	tempFile, err := os.CreateTemp(os.TempDir(), tempFilePattern)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}

	if _, err := io.Copy(tempFile, source); err != nil {
		tempFile.Close()
		os.Remove(tempFile.Name())
		return "", fmt.Errorf("failed to copy file content: %w", err)
	}

	if err := tempFile.Close(); err != nil {
		os.Remove(tempFile.Name())
		return "", fmt.Errorf("failed to close temp file: %w", err)
	}

	return tempFile.Name(), nil
}

func (e *Extractor) formatWithPrettier(filePath string) error {
	ctx, cancel := context.WithTimeout(context.Background(), prettierTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, e.config.Prettier, "--write", filePath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("prettier formatting timed out after %v", prettierTimeout)
		}
		return fmt.Errorf("prettier formatting failed: %w\nOutput: %s", err, output)
	}
	return nil
}

func (e *Extractor) processContent(filePath string) (string, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read formatted file: %w", err)
	}

	stringContent := string(content)
	stringContent = nlsErrorRegex.ReplaceAllString(stringContent, "return typeof e === 'string' ? e : '';")
	stringContent = `
const noop = () => {};
const noopObj = () => ({ dispose: noop });
const noopConnection = {
  type: 3,
  protocol: {
    send: noop,
    onMessage: noopObj,
    on: noop,
    dispose: noop
  },
  dispose: noop,
  on: noop
};

globalThis.require = globalThis.require || (() => ({}));
globalThis.process = globalThis.process || { env: {}, platform: 'darwin' };

` + stringContent

	errorReplacements := map[string]string{
		`throw new Error("No connection information defined in environment!")`: `return noopConnection`,
		`throw new Error("Connection to remote side has been disposed")`:       `return`,
		`throw new Error("Connection got disposed")`:                           `return`,
	}

	for oldStr, newStr := range errorReplacements {
		stringContent = strings.ReplaceAll(stringContent, oldStr, newStr)
	}

	if !e.config.IsNightly {
		stringContent = e.applyNonNightlyFixes(stringContent)
	} else {
		e.config.Logger.Println("Processing Cursor Nightly - applying minimal compatibility fixes")
		stringContent = e.applyNightlyFixes(stringContent)
	}

	stringContent = mainExecRegex.ReplaceAllString(stringContent, "// Main execution disabled for extraction")

	return stringContent, nil
}

func (e *Extractor) applyNonNightlyFixes(content string) string {
	e.config.Logger.Println("Applying non-nightly compatibility fixes...")

	content = initCallRegex.ReplaceAllString(content, "// Skipped initialization to extract service definitions")
	content = e.exposeServiceRegistry(content)

	return content
}

func (e *Extractor) applyNightlyFixes(content string) string {
	return e.exposeServiceRegistry(content)
}

func (e *Extractor) exposeServiceRegistry(content string) string {
	matches := serviceRegistryRegex.FindAllStringSubmatch(content, -1)
	if len(matches) > 0 {
		var exposureCode strings.Builder
		seenVars := make(map[string]bool)

		for _, match := range matches {
			if len(match) <= 1 {
				continue
			}

			registryName := match[1]
			if seenVars[registryName] {
				continue
			}
			seenVars[registryName] = true
			e.config.Logger.Printf("Found service registry variable: %s", registryName)

			fmt.Fprintf(&exposureCode, `
// Expose the service registry globally.
if (typeof %s !== 'undefined') {
  globalThis.%s = %s;
  console.log('Exposed %s as service registry');
}`, registryName, registryName, registryName, registryName)
		}

		if exposureCode.Len() > 0 {
			return content + exposureCode.String()
		}
	}

	e.config.Logger.Println("No service registry found statically, using dynamic detection")
	return content + e.getDynamicDetectionCode()
}

func (e *Extractor) getDynamicDetectionCode() string {
	return fmt.Sprintf(`
setTimeout(function() {
  try {
    console.log('Starting dynamic service registry detection...');

    for (const [key, value] of Object.entries(globalThis)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !value.prototype) {
        try {
          const entries = Object.entries(value);
          let aiServerCount = 0;

          for (const [k, v] of entries) {
            if (k && k.includes && k.includes('aiserver.v1.') && v && v.typeName === k) {
              aiServerCount++;
            }
          }

          if (aiServerCount >= %d) {
            globalThis.serviceRegistry = value;
            console.log('Found service registry as ' + key + ' with ' + aiServerCount + ' aiserver services');
            return;
          }
        } catch (e) {
        }
      }
    }

    console.log('Dynamic detection completed, no service registry found');
  } catch (e) {
    console.log('Error in dynamic service registry detection:', e.message);
  }
}, %d);`, minAiServerServices, fallbackTimeout)
}

func (e *Extractor) runNodeExtraction(processedContent string) (string, error) {
	tempDir, err := os.MkdirTemp(os.TempDir(), tempDirPattern)
	if err != nil {
		return "", fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tempDir)

	if err := e.setupNodePackage(tempDir); err != nil {
		return "", err
	}

	scriptPath, err := e.createExtractionScript(tempDir, processedContent)
	if err != nil {
		return "", err
	}

	if err := e.executeNodeScript(scriptPath, e.config.OutputDir); err != nil {
		return "", err
	}

	return e.config.OutputDir, nil
}

func (e *Extractor) setupNodePackage(dir string) error {
	packageJSON := `{
  "type": "module",
  "dependencies": {
    "@sentry/node": "*",
    "@vscode/ripgrep": "*",
    "node-pty": "*",
    "vscode-uri": "*",
    "vscode-regexpp": "*",
    "@vscode/proxy-agent": "*",
    "@opentelemetry/sdk-trace-node": "*",
    "@opentelemetry/exporter-trace-otlp-proto": "*",
    "@opentelemetry/api": "*",
    "@opentelemetry/sdk-node": "*",
    "@opentelemetry/resources": "*",
    "@opentelemetry/semantic-conventions": "*",
    "rxjs": "*"
  }
}`

	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(packageJSON), 0644); err != nil {
		return fmt.Errorf("failed to create package.json: %w", err)
	}

	e.config.Logger.Println("Installing Node.js dependencies...")

	ctx, cancel := context.WithTimeout(context.Background(), npmInstallTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, e.config.Npm, "install", "--silent")
	cmd.Dir = dir

	output, err := cmd.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("npm install timed out after %v", npmInstallTimeout)
		}
		return fmt.Errorf("npm install failed: %w\nOutput: %s", err, output)
	}

	return nil
}

func (e *Extractor) createExtractionScript(dir string, content string) (string, error) {
	scriptPath := filepath.Join(dir, "cursor-rpc-decorated.mjs")
	file, err := os.Create(scriptPath)
	if err != nil {
		return "", fmt.Errorf("failed to create extraction script: %w", err)
	}
	defer file.Close()

	parts := []string{PreProcess, content, PostProcess}
	for _, part := range parts {
		if _, err := file.WriteString(part); err != nil {
			return "", fmt.Errorf("failed to write script content: %w", err)
		}
	}

	return scriptPath, nil
}

func (e *Extractor) executeNodeScript(scriptPath string, outputDir string) error {
	ctx, cancel := context.WithTimeout(context.Background(), nodeScriptTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, e.config.Node, scriptPath, outputDir)

	output, err := cmd.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("node script execution timed out after %v", nodeScriptTimeout)
		}
		return fmt.Errorf("node script execution failed: %w\nOutput: %s", err, output)
	}

	if len(output) > 0 {
		e.config.Logger.Print(string(output))
	}

	return nil
}
