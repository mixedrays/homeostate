/// <reference types="vite/client" />
import css from "./styles.css?inline";

const PROPERTY_RULE = /@property\s+[\w-]+\s*\{[^}]*\}/g;

/** The compiled devtools stylesheet, for the shadow root. */
export const devtoolsCss: string = css;

/**
 * Tailwind's `@property` registrations. Browsers ignore `@property` inside a shadow root,
 * which leaves utilities such as shadows and transforms without their initial values, so
 * these go into the document instead. They only give Tailwind's `--tw-*` variables a type
 * and an initial value; a page on Tailwind 4 registers the same ones.
 */
export const devtoolsPropertiesCss: string = (
  css.match(PROPERTY_RULE) ?? []
).join("\n");
