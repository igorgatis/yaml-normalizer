#!/usr/bin/env -S deno run

import { parse as parseFlags } from "https://deno.land/std@0.208.0/flags/mod.ts";
import {
  parseAll as parseYamlObjects,
  stringify as stringifyYaml,
} from "https://deno.land/std@0.208.0/yaml/mod.ts";

interface K8sObject extends Record<string, unknown> {
  kind: string;
  metadata: {
    name: string;
  };
}

async function main() {
  const flags = parseFlags(Deno.args, {
    boolean: ["help", "sort-top-level"],
  });

  if (flags.help) {
    console.log("Usage: yaml-normalizer [options] <files...>");
    console.log("");
    console.log("Options:");
    console.log("  --help            Show this help message");
    console.log("  --sort-top-level  Sort top level objects by kind and name");
    Deno.exit(0);
  }

  const files = flags._ as string[];
  if (files.length === 0) {
    console.error("Please provide YAML files as arguments");
    Deno.exit(1);
  }

  await normalize(flags["sort-top-level"], files);
}

async function normalize(sortTopLevel: boolean, files: string[]) {
  const allObjects: K8sObject[] = [];
  for (const file of files) {
    try {
      const content = await Deno.readTextFile(file);
      const input = parseYamlObjects(content);
      if (Array.isArray(input)) {
        allObjects.push(...input);
      } else {
        allObjects.push(input as K8sObject);
      }
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
      continue;
    }
  }

  let sortedObjects = sortFieldsRecursively(allObjects) as K8sObject[];

  if (sortTopLevel) {
    sortedObjects = sortedObjects.sort((a, b) => {
      const kindComparison = a.kind?.localeCompare(b.kind || "");
      if (kindComparison !== 0) {
        return kindComparison;
      }
      return a.metadata?.name?.localeCompare(b.metadata?.name || "");
    });
  }

  sortedObjects.forEach((obj, index) => {
    const sep = index < sortedObjects.length - 1 ? "---" : "";
    console.log(stringifyYaml(obj, { indent: 2 }) + sep);
  });
}

class SortingEntry {
  public readonly score: number;
  public readonly key: string;
  public readonly value: unknown;

  constructor(e: [string, unknown]) {
    const [key, value] = e;
    this.key = key;
    this.value = value;
    if (key === "name" || key === "namespace") {
      this.score = 0;
    } else if (Array.isArray(value) || typeof value === "object") {
      this.score = 2;
    } else {
      this.score = 1;
    }
  }

  compareTo(other: SortingEntry): number {
    if (this.score !== other.score) {
      return this.score - other.score;
    }
    return this.key.localeCompare(other.key);
  }
}

function sortFieldsRecursively(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => sortFieldsRecursively(item));
  }
  if (typeof input === "object" && input !== null) {
    const entries = Object.entries(input)
      .map((a) => new SortingEntry(a))
      .sort((a, b) => a.compareTo(b))
      .map((a) => [a.key, sortFieldsRecursively(a.value)]);
    return Object.fromEntries(entries);
  }
  return input;
}

if (import.meta.main) {
  main();
}
