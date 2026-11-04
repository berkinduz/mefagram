import nextEnv from "@next/env";

// Setup and Next must interpret the same escaping and variable expansion.
export function readEnvironment(contents: string, path: string) {
  const file = {
    path,
    contents,
    env: {} as Record<string, string | undefined>,
  };
  nextEnv.processEnv([file], process.cwd(), undefined, true);
  return Object.fromEntries(
    Object.entries(file.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function serializeEnvironment(config: Record<string, string>) {
  return (
    Object.entries(config)
      .map(([key, value]) => {
        const quote = ["'", "`", '"'].find(
          (candidate) =>
            !value.includes(candidate) &&
            (candidate !== '"' || !/\\[nr]/.test(value)),
        );
        if (!quote)
          throw new Error(
            `Cannot safely encode ${key} in an environment file. Use a value without all three quote characters.`,
          );
        return `${key}=${quote}${value.replace(/\$/g, "\\$")}${quote}`;
      })
      .join("\n") + "\n"
  );
}
