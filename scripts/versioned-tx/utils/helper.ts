import * as fs from "fs";

const LOOKUP_TALBE_FILE_PATH = "versioned-tx/lookup-table.json";
const LOOKUP_TALBE_NOT_CREATED_FILE_PATH =
  "versioned-tx/lookup-table-not-created.json";

export const loadLookupTable = () => {
  let lookupTableData = {};

  if (fs.existsSync(LOOKUP_TALBE_FILE_PATH)) {
    const fileContent = fs.readFileSync(LOOKUP_TALBE_FILE_PATH, "utf8");
    lookupTableData = JSON.parse(fileContent);
  }

  return lookupTableData;
};

export const loadNotCreatedLookupTable = () => {
  let lookupTableData = {};

  if (fs.existsSync(LOOKUP_TALBE_NOT_CREATED_FILE_PATH)) {
    const fileContent = fs.readFileSync(
      LOOKUP_TALBE_NOT_CREATED_FILE_PATH,
      "utf8"
    );
    lookupTableData = JSON.parse(fileContent);
  }

  return lookupTableData;
};

export const saveDataToLookupTable = (
  lookupTableData: object,
  whirlpoolAddr: string,
  lookupTableAddress: string
) => {
  lookupTableData[whirlpoolAddr] = lookupTableAddress;

  fs.writeFileSync(
    LOOKUP_TALBE_FILE_PATH,
    JSON.stringify(lookupTableData, null, 2)
  );
};
