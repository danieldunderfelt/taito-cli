---
name: react-localization
description: Find and localize untranslated user-facing strings in React components. Use when asked to localize, internationalize, add i18n, find missing translations, or add translations.
---

# React Localization

Localize hardcoded or otherwise unlocalized user-facing strings in the codebase. The main focus is to move hardcoded user-facing strings to the appropriate localization files. If the user asks to only work on a specific part of the app, focus on that part.

## Source language

The source language is English. Most of the current UI text is in English, and it should be moved to the English localization files. The English translation files are named `en.json` in each namespace folder.

## Workflow

1. Run eslint to find untranslated strings
2. Process each file with lint errors
3. For each string: determine namespace, add to JSON, replace with t() call
4. Verify no new lint errors
5. Regenerate localization types
6. Check for remaining lint or type issues

## Finding Untranslated Strings

Run from the root of the project:

```bash
npx eslint "src/**/*.{ts,tsx}"
```

If the user wants to focus on a specific part of the app, adjust the glob path to only lint the relevant files.

Only process lint errors from the rule `i18next/no-literal-string`. Ignore other lint rules entirely. Do not address, fix, disable, or acknowledge lint errors from other rules in any way. The only exception is issues arising from adding localization or addressing localization issues.

The linter may miss some strings or flag strings that should not be translated (technical strings, names, keys, IDs, console logs, etc). Use your best judgment to identify user-facing strings and process only those. Disable the `i18next/no-literal-string` rule with a comment for false positives.

## Localization Files

Location: `src/locales/{{namespace}}/{{language}}.json`

Determine the appropriate namespace for each string based on the content of the string and the context in which it appears. A file can have multiple namespaces. The namespace should be related to the "feature domain" of the string, not the component it is in. For example, the string "User profile" shown in the user profile page belongs to the "user" namespace, not the "profile" component.

Create new namespace files when no suitable namespace exists. All languages need to have the same namespace files, so add a dummy json file to all other languages than `en` if a new namespace file is needed. The dummy files should only contain an empty object, no keys or values.

Ensure that the namespace files do not contain duplicated keys.

## Translation Hook

Import from `react-i18next`:

```tsx
import { useTranslation } from "react-i18next";
```

Call at component top with namespace(s):

```tsx
const { t } = useTranslation("common");
// or multiple:
const { t } = useTranslation(["feedback", "common"]);
```

A file can have multiple components. Diligently make sure to add the useTranslation call to all components in a file that need translations.

## t() Function Format

Always use the string format:

```tsx
// Single namespace
const { t } = useTranslation("common");
t("navigation.next"); // The namespace is not included in the key.

// Multiple namespaces - first namespace is the default
const { t } = useTranslation(["feedback", "common"]);
t("flow.title"); // from feedback (first). The first namespace must NOT be in the key.
t("common:navigation.next"); // from common (prefixed with namespace:). All namespaces apart from the first should be prefixed.
```

It is very important to get the localization key correct. Otherwise, the translations will not be found. When a single namespace is used, the namespace is not included in the key. When multiple namespaces are used, the first namespace is not included in the key. The other namespaces must be prefixed with `namespace:`.

Ignore type errors from the added translation keys. These will be fixed when the i18next types are regenerated.

If the t() call happens inside a useMemo, useEffect, or useCallback, make sure that the `t` is included in the dependencies array.

### Pluralization

To use the i18next pluralization feature for a key, do not use an object value. Instead, there should be multiple keys suffixed with `_one`, `_other`, etc. For example:

```json
{
  "room_one": "room",
  "room_other": "rooms"
}
```

```tsx
t("room", { count: countValue });
```

## Passing t() to Functions

For functions receiving t(), use a single namespace and type with `TFunction`:

```tsx
import { useTranslation, type TFunction } from "react-i18next";

function formatLabel(t: TFunction<"common">) {
  return t("inputs.min");
}

// In component:
const { t } = useTranslation("common");
formatLabel(t);
```

For components that need multiple namespaces, assign multiple t() functions to separate variables. Always use the type `TFunction` for the t-function, do not try to infer the type from the useTranslation call.

Do not pass the t() function to components or hooks. Instead, call the useTranslation hook separately in each component that needs it. Be aware that there can be multiple components in a file, so the useTranslation hook must be called in each component that needs it.

## Interpolation

Use i18next interpolation for dynamic values:

```json
{
  "greeting": "Hi, {{name}}!"
}
```

```tsx
t("greeting", { name: userName });
```

Always use interpolation for dynamic values. Never split strings into parts like `stringPart1`, `stringPart2` and combine them with concatenation in the UI.

## i18next configuration

If it does not already exist, create a new i18next configuration file in the root of the project. The file should be named `i18next.config.ts`. The file should contain the following configuration:

```ts
// i18next.config.ts
import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: "src/locales/{{namespace}}/{{language}}.json",
  },
});
```

## Check for remaining issues

After the types are regenerated, check for remaining issues with the full linting command:

```bash
npm run lint
```

Also check for type issues:

```bash
npm run typecheck
```

Fix all issues and run the commands again until no issues are found.

## Avoiding Duplication

Before adding a string:

1. Check if it already exists in any namespace
2. If common term, move to `common`
3. Some duplication is acceptable for context-specific translations

## Example Transformation

Before:

```tsx
function UserProfileCard({ title }) {
  return (
    <Card>
      <Text>User profile</Text>
      <Button>Save</Button>
    </Card>
  );
}
```

After:

```tsx
import { useTranslation } from "react-i18next";

function UserProfileCard({ title }) {
  const { t } = useTranslation(["user", "common"]);

  return (
    <Card>
      <Text>{t("profileTitle")}</Text>
      <Button>{t("common:save")}</Button>
    </Card>
  );
}
```

With `user.json`:

```json
{
  "profileTitle": "User profile"
}
```

And with `common.json`:

```json
{
  "save": "Save"
}
```

## Strings to Ignore

Do not localize:

- Console logs, names, IDs, keys, routes, etc.
- Component prop values that are not user-facing (testID, className, etc.)
- Already translated strings (using t() or Trans)
- Anything that is not user-facing
