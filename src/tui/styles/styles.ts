import { Chalk } from "chalk";

export const Primary = "#ff1cf0";
export const Success = "#50fa7b";
export const Warning = "#f9e2af";
export const Error = "#f38ba8";
export const Info = "#00d9ff";

let chalkInstance = new Chalk({ level: 3 });

export const setNoColor = (disable: boolean): void => {
  chalkInstance = new Chalk({ level: disable ? 0 : 3 });
};

export const TitleStyle = (text: string): string => {
  return chalkInstance.hex(Primary).bold(text);
};

export const PrimaryStyle = (text: string): string => {
  return chalkInstance.hex(Primary)(text);
};

export const InfoStyle = (text: string): string => {
  return chalkInstance.hex(Info)(text);
};

export const SuccessStyle = (text: string): string => {
  return chalkInstance.hex(Success)(text);
};

export const WarningStyle = (text: string): string => {
  return chalkInstance.hex(Warning)(text);
};

export const ErrorStyle = (text: string): string => {
  return chalkInstance.hex(Error)(text);
};
