import * as fs from "fs";
import { getConfig } from "../../create_pool/utils";

const LOOKUP_TALBE_FILE_PATH = "versioned-tx/lookup-table.json";
const LOOKUP_TALBE_FILE_PATH_TESTNET = "versioned-tx/lookup-table-testnet.json";
const POOLS_FILE_PATH = "versioned-tx/pools.json";

const getLookupTableFilePath = () => {
  if (process.env.TESTNET === "1") {
    return LOOKUP_TALBE_FILE_PATH_TESTNET;
  } else {
    return LOOKUP_TALBE_FILE_PATH;
  }
};

export const loadLookupTable = () => {
  let lookupTableFilePath = getLookupTableFilePath();
  let lookupTableData = {};

  if (fs.existsSync(lookupTableFilePath)) {
    const fileContent = fs.readFileSync(lookupTableFilePath, "utf8");
    lookupTableData = JSON.parse(fileContent);
  }

  return lookupTableData;
};

export const loadPools = () => {
  let pools = [];

  if (fs.existsSync(POOLS_FILE_PATH)) {
    const fileContent = fs.readFileSync(POOLS_FILE_PATH, "utf8");
    pools = JSON.parse(fileContent);
  }

  return pools;
};

export const saveDataToLookupTable = (
  lookupTableData: object,
  whirlpoolAddr: string,
  lookupTableAddress: string
) => {
  lookupTableData[whirlpoolAddr] = lookupTableAddress;

  const lookupTableFilePath = getLookupTableFilePath();

  fs.writeFileSync(
    lookupTableFilePath,
    JSON.stringify(lookupTableData, null, 2)
  );
};
