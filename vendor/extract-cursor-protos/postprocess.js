import { promises as fspromises } from "fs";
import path from "path";

const EXTRACTION_TIMEOUT_MS = 30000;
const REGISTRY_DETECTION_RETRIES = 3;
const REGISTRY_DETECTION_DELAY_MS = 500;
const MIN_SERVICES_THRESHOLD = 3;

const exitTimer = setTimeout(() => {
  console.error(`Force exit: extraction timed out after ${EXTRACTION_TIMEOUT_MS / 1000} seconds`);
  process.exit(1);
}, EXTRACTION_TIMEOUT_MS);

const typeRegistry = new Map();
const enumRegistry = new Map();
const serviceRegistry = new Map();
const processingTypes = new Set();

const getScalarName = (scalar) => {
  const scalarMap = {
    1: "double",
    2: "float",
    3: "int64",
    4: "uint64",
    5: "int32",
    6: "fixed64",
    7: "fixed32",
    8: "bool",
    9: "string",
    12: "bytes",
    13: "uint32",
    15: "sfixed32",
    16: "sfixed64",
    17: "sint32",
    18: "sint64",
  };

  const name = scalarMap[scalar];
  if (name) {
    return name;
  }

  console.warn(`Unknown scalar type: ${scalar}, using 'bytes' as fallback`);
  return "bytes";
};

const registerEnum = (prefix, enumDef, shouldRegisterGlobal = true) => {
  if (!enumDef?.typeName) {
    console.warn("Invalid enum definition: missing typeName");
    return { name: "UnknownEnum", fields: [], lines: ["enum UnknownEnum {}"] };
  }

  if (enumRegistry.has(enumDef.typeName)) {
    return enumRegistry.get(enumDef.typeName);
  }

  const nameSpl = enumDef.typeName.replace(prefix, "").split(".");
  const name = nameSpl[nameSpl.length - 1];
  const e = {
    name,
    fields: (enumDef.values || []).map((val, i) => `${val.name} = ${i};`),
  };

  e.lines = [`enum ${name} { // ${enumDef.typeName}`];
  e.lines.push(...e.fields.map((f) => `\t${f}`));
  e.lines.push("}");

  if (shouldRegisterGlobal) {
    enumRegistry.set(enumDef.typeName, e);
  }

  return e;
};

const registerTypeDefinition = (prefix, typeDef, shouldRegisterGlobal = true) => {
  if (!typeDef?.typeName) {
    console.warn("Invalid type definition: missing typeName");
    return { name: "UnknownType", fields: [], lines: ["message UnknownType {}"], locals: new Map() };
  }

  if (typeRegistry.has(typeDef.typeName)) {
    return typeRegistry.get(typeDef.typeName);
  }

  if (processingTypes.has(typeDef.typeName)) {
    const nameSpl = typeDef.typeName.replace(prefix, "").split(".");
    const name = nameSpl[nameSpl.length - 1];
    return { name, fields: [], lines: [], locals: new Map() };
  }

  processingTypes.add(typeDef.typeName);

  try {
    const nameSpl = typeDef.typeName.replace(prefix, "").split(".");
    const name = nameSpl[nameSpl.length - 1];
    const fields = [];
    const typeObj = {
      name,
      locals: new Map(),
    };

    if (shouldRegisterGlobal) {
      typeRegistry.set(typeDef.typeName, typeObj);
    }

    const preamble = [];
    const fieldsList = typeDef.fields?._fields?.() || [];

    for (const field of fieldsList) {
      if (!field) {
        continue;
      }

      let fieldType = null;
      const repeated = field.repeated;
      const opt = field.opt;
      const fieldPrefix = repeated ? "repeated " : opt ? "optional " : "";

      if (field.kind === "message") {
        if (!field.T?.typeName) {
          console.warn(`Field ${field.name} has message kind but missing T.typeName`);
          continue;
        }

        if (field.T.typeName === typeDef.typeName) {
          fieldType = name;
        } else if (!typeRegistry.has(field.T.typeName)) {
          let registerGlobalNested = true;
          const newFieldName = field.T.typeName.replace(prefix, "");
          if (newFieldName.split(".").length > 1) {
            registerGlobalNested = false;
          }

          const newFieldDef = registerTypeDefinition(prefix, field.T, registerGlobalNested);
          if (!registerGlobalNested && !typeObj.locals.has(field.T.typeName)) {
            typeObj.locals.set(field.T.typeName, true);
            preamble.push(...newFieldDef.lines.map((l) => `\t${l}`));
          }
          fieldType = newFieldDef.name;
        } else {
          fieldType = typeRegistry.get(field.T.typeName).name;
        }
      } else if (field.kind === "scalar") {
        fieldType = getScalarName(field.T);
      } else if (field.kind === "enum") {
        if (!field.T?.typeName) {
          console.warn(`Field ${field.name} has enum kind but missing T.typeName`);
          continue;
        }

        const enumName = field.T.typeName.replace(prefix, "");
        let registerGlobalEnum = true;
        if (enumName.split(".").length > 1) {
          registerGlobalEnum = false;
        }
        const newEnum = registerEnum(prefix, field.T, registerGlobalEnum);
        if (!registerGlobalEnum && !typeObj.locals.has(field.T.typeName)) {
          typeObj.locals.set(field.T.typeName, newEnum);
          preamble.push(...newEnum.lines.map((l) => `\t${l}`));
        }
        fieldType = newEnum.name;
      } else if (field.kind === "map") {
        const keyType = getScalarName(field.K);
        let valueType;
        if (field.V?.kind === "scalar") {
          valueType = getScalarName(field.V.T);
        } else if (field.V?.kind === "message" && field.V?.T?.typeName) {
          valueType = field.V.T.typeName.split(".").pop();
        } else {
          valueType = "bytes";
        }
        fieldType = `map<${keyType}, ${valueType}>`;
        fields.push(`${fieldType} ${field.name} = ${field.no};`);
        continue;
      } else {
        continue;
      }

      if (fieldType) {
        fields.push(`${fieldPrefix}${fieldType} ${field.name} = ${field.no};`);
      }
    }

    typeObj.fields = fields;
    typeObj.lines = [`message ${name} { // ${typeDef.typeName}`];
    typeObj.lines.push(...preamble.map((pl) => `\t${pl}`));
    typeObj.lines.push(...fields.map((f) => `\t${f}`));
    typeObj.lines.push("}");

    return typeObj;
  } finally {
    processingTypes.delete(typeDef.typeName);
  }
};

const registerService = (service) => {
  if (!service?.typeName || !service?.methods) {
    console.warn("Invalid service definition");
    return;
  }

  const typeName = service.typeName;
  const parts = typeName.split(".");
  const serviceName = parts[parts.length - 1];
  const packageName = parts.slice(0, parts.length - 1).join(".");
  const lines = [`service ${serviceName} {`];

  for (const [, method] of Object.entries(service.methods)) {
    if (!method?.I || !method?.O) {
      console.warn(`Invalid method in service ${serviceName}`);
      continue;
    }

    const inType = registerTypeDefinition(`${packageName}.`, method.I);
    const outType = registerTypeDefinition(`${packageName}.`, method.O);
    const streaming = method.kind === 1;
    lines.push(`\trpc ${method.name}(${inType.name}) returns (${streaming ? "stream " : ""}${outType.name}) {}`);
  }

  lines.push("}");
  serviceRegistry.set(typeName, {
    package: packageName,
    name: serviceName,
    lines,
  });
};

function findAllServiceRegistries() {
  const registries = [];
  const seenKeys = new Set();

  for (const [key, value] of Object.entries(globalThis)) {
    if (seenKeys.has(key)) {
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    try {
      const entries = Object.entries(value);
      let serviceCount = 0;
      let aiServerCount = 0;
      let agentServiceCount = 0;

      for (const [k, v] of entries) {
        if (k?.includes && v?.typeName === k && v?.methods) {
          serviceCount++;
          if (k.includes("aiserver.v1.")) {
            aiServerCount++;
          }
          if (k.includes("agent.v1.")) {
            agentServiceCount++;
          }
        }
      }

      if (serviceCount >= MIN_SERVICES_THRESHOLD) {
        console.log(
          `Found service registry '${key}' with ${serviceCount} services (aiserver: ${aiServerCount}, agent: ${agentServiceCount})`,
        );
        registries.push(value);
        seenKeys.add(key);
      }
    } catch (err) {
      console.warn(`Error inspecting globalThis.${key}: ${err.message}`);
    }
  }

  return registries;
}

function mergeRegistries(registries) {
  const merged = {};
  for (const reg of registries) {
    Object.assign(merged, reg);
  }
  return merged;
}

async function findRegistriesWithRetry() {
  for (let attempt = 1; attempt <= REGISTRY_DETECTION_RETRIES; attempt++) {
    const registries = findAllServiceRegistries();

    if (registries.length > 0) {
      console.log(`Found ${registries.length} registry(ies) on attempt ${attempt}`);
      return mergeRegistries(registries);
    }

    if (globalThis.serviceRegistry) {
      console.log("Found registry in globalThis.serviceRegistry");
      return globalThis.serviceRegistry;
    }

    if (attempt < REGISTRY_DETECTION_RETRIES) {
      console.log(
        `No registries found, retrying in ${REGISTRY_DETECTION_DELAY_MS}ms (attempt ${attempt}/${REGISTRY_DETECTION_RETRIES})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, REGISTRY_DETECTION_DELAY_MS));
    }
  }

  return null;
}

async function ensureDir(dirPath) {
  try {
    await fspromises.access(dirPath);
  } catch {
    await fspromises.mkdir(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

function getPrimaryPackage() {
  const packages = new Set();
  for (const service of serviceRegistry.values()) {
    if (service.package) {
      packages.add(service.package);
    }
  }

  if (packages.has("aiserver.v1")) {
    return "aiserver.v1";
  }

  return packages.size > 0 ? Array.from(packages)[0] : "aiserver.v1";
}

async function runExtraction(registry) {
  console.log("Processing services...");

  let processedCount = 0;
  let errorCount = 0;

  for (const [, serviceDefinition] of Object.entries(registry)) {
    if (!serviceDefinition?.typeName || !serviceDefinition?.methods) {
      continue;
    }

    try {
      registerService(serviceDefinition);
      processedCount++;
    } catch (error) {
      console.error(`Error processing service ${serviceDefinition.typeName}: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`Processed ${processedCount} services (${errorCount} errors)`);

  const outPath = process.argv[process.argv.length - 1];
  if (!outPath || outPath.startsWith("-")) {
    throw new Error("Invalid output path. Usage: node postprocess.js <output-path>");
  }

  const primaryPackage = getPrimaryPackage();
  const lines = [
    'syntax = "proto3";',
    `package ${primaryPackage};`,
    `option go_package = "cursor/gen/${primaryPackage.replace(".", "/")};${primaryPackage.replace(".", "")}";`,
    "",
  ];

  for (const e of enumRegistry.values()) {
    lines.push(...e.lines, "");
  }

  for (const t of typeRegistry.values()) {
    lines.push(...t.lines, "");
  }

  for (const s of serviceRegistry.values()) {
    lines.push(...s.lines, "");
  }

  const protoContent = lines.join("\n");

  try {
    await ensureDir(outPath);

    const dirPath = path.join(outPath, "aiserver", "v1");
    await ensureDir(dirPath);

    const protoFilePath = path.join(dirPath, "aiserver.proto");
    await fspromises.writeFile(protoFilePath, protoContent);

    console.log(`Generated ${protoFilePath}`);
    console.log(` - ${enumRegistry.size} enums`);
    console.log(` - ${typeRegistry.size} messages`);
    console.log(` - ${serviceRegistry.size} services`);

    clearTimeout(exitTimer);
    process.exit(0);
  } catch (error) {
    throw new Error(`Failed to write proto file: ${error.message}`);
  }
}

console.log("Starting service registry detection...");

findRegistriesWithRetry()
  .then((registry) => {
    if (!registry) {
      console.error("Could not find any service registries after all retries");
      process.exit(1);
    }
    return runExtraction(registry);
  })
  .catch((error) => {
    console.error(`Extraction failed: ${error.message}`);
    process.exit(1);
  });
