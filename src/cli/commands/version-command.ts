import { Command } from "commander";
import { getVersion } from "../../version/version-info.js";

export let versionShort = false;

export const createVersionCommand = (): Command => {
  const cmd = new Command("version");
  cmd
    .description("Show version information")
    .option("--short", "show only version number", false)
    .action((options) => {
      versionShort = Boolean(options.short);
      runVersion();
    });

  return cmd;
};

export const runVersion = (): void => {
  const info = getVersion();

  if (versionShort) {
    console.log(info.version);
    return;
  }

  console.log(`Copilot Ralph Node v${info.version}`);
  console.log(`Commit: ${info.commit}`);
  console.log(`Built: ${info.buildDate}`);
  console.log(`Node: ${process.version}`);
  console.log(`Platform: ${process.platform}/${process.arch}`);
};
