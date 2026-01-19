#!/usr/bin/env node

import { Command } from "commander";
import { createRunCommand } from "./cli/commands/run-command.js";
import { createVersionCommand } from "./cli/commands/version-command.js";
import { setNoColor } from "./tui/styles/styles.js";

const program = new Command();

program
  .name("ralph")
  .description(
    "Ralph implements the \"Ralph Wiggum\" technique for self-referential AI development loops using Copilot CLI SDK."
  )
  .option("--no-color", "disable colored output", false)
  .addCommand(createRunCommand())
  .addCommand(createVersionCommand());

program.hook("preAction", (thisCommand, actionCommand) => {
  const options = typeof actionCommand.optsWithGlobals === "function"
    ? actionCommand.optsWithGlobals()
    : thisCommand.opts();
  if (options.noColor) {
    setNoColor(true);
  }
});

program.parseAsync(process.argv).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
