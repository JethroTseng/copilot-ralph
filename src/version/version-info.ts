export let Version = "dev";
export let Commit = "unknown";
export let BuildDate = "unknown";
export let GoVersion = "unknown";

export interface VersionInfo {
  version: string;
  commit: string;
  buildDate: string;
  goVersion: string;
}

export const getVersion = (): VersionInfo => {
  return {
    version: Version,
    commit: Commit,
    buildDate: BuildDate,
    goVersion: GoVersion
  };
};
