/** @type {import("prettier").Config} */
export default {
  proseWrap: "never",
  plugins: ["prettier-plugin-svelte"],
  overrides: [{ files: "*.svelte", options: { parser: "svelte" } }],
};
