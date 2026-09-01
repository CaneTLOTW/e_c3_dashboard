import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const root = new URL("../custom_components/e_c3_dashboard/", import.meta.url);

function readExtra(path) {
  const source = fs.readFileSync(new URL(path, root), "utf8");
  const sandbox = { catalog: null };
  vm.runInNewContext(source.replace("export const EXTRA_FRONTEND_TEXT =", "catalog ="), sandbox);
  return sandbox.catalog;
}

test("report remaining frontend translation gaps", async () => {
  const { FRONTEND_TEXT } = await import(new URL("static/i18n.js", root));
  const catalogs = Object.assign(
    {},
    readExtra("static/i18n-extra-west.js"),
    readExtra("static/i18n-extra-north.js"),
    readExtra("static/i18n-extra-east.js"),
  );
  for (const [language, catalog] of Object.entries(catalogs)) {
    for (const namespace of ["tripHistory", "chargeHistory", "vehicleOverview", "dashboard"]) {
      const canonical = Object.keys(FRONTEND_TEXT[namespace].en);
      const present = new Set(Object.keys(catalog[namespace] || {}));
      const missing = canonical.filter((key) => !present.has(key));
      console.log(`I18N_GAP ${language}/${namespace} ${JSON.stringify(missing)}`);
    }
  }
});
