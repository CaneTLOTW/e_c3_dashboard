/* Runtime composition layer for the bundled Lovelace localisation catalogs.
 *
 * Keep the established DE/EN/FR + base extra-language catalog in i18n-core.js,
 * then overlay the reviewed advanced completion catalogs. All browser-facing
 * imports use the same 0.5.54 cache key as the release candidate resources.
 */
import {
  FRONTEND_TEXT,
  languageFor,
  localeFor,
  textFor,
} from "./i18n-core.js?v=0.5.54";
import { ADVANCED_FRONTEND_TEXT as WESTERN_ADVANCED } from "./i18n-advanced-west.js?v=0.5.54";
import { ADVANCED_FRONTEND_TEXT as NORTHERN_ADVANCED } from "./i18n-advanced-north.js?v=0.5.54";
import { ADVANCED_FRONTEND_TEXT as EASTERN_ADVANCED } from "./i18n-advanced-east.js?v=0.5.54";

for (const catalog of [WESTERN_ADVANCED, NORTHERN_ADVANCED, EASTERN_ADVANCED]) {
  for (const [language, namespaces] of Object.entries(catalog)) {
    for (const [namespace, translated] of Object.entries(namespaces)) {
      FRONTEND_TEXT[namespace][language] = {
        ...FRONTEND_TEXT[namespace].en,
        ...FRONTEND_TEXT[namespace][language],
        ...translated,
      };
    }
  }
}

// Capability labels intentionally remain centrally owned rather than being
// dependent on completeness of the per-language frontend delta catalogs.
const CAPABILITY_LABELS = {
  de: ["Kraftstoff", "Kraftstoffreichweite", "Kraftstoffverbrauch"], en: ["Fuel", "Fuel range", "Fuel consumption"],
  fr: ["Carburant", "Autonomie carburant", "Consommation carburant"], it: ["Carburante", "Autonomia carburante", "Consumo carburante"],
  es: ["Combustible", "Autonomía de combustible", "Consumo de combustible"], pt: ["Combustível", "Autonomia de combustível", "Consumo de combustível"],
  nl: ["Brandstof", "Brandstofbereik", "Brandstofverbruik"], da: ["Brændstof", "Brændstofrækkevidde", "Brændstofforbrug"],
  nb: ["Drivstoff", "Drivstoffrekkevidde", "Drivstofforbruk"], sv: ["Bränsle", "Bränsleräckvidd", "Bränsleförbrukning"],
  fi: ["Polttoaine", "Polttoaineen toimintamatka", "Polttoaineenkulutus"], pl: ["Paliwo", "Zasięg na paliwie", "Zużycie paliwa"],
  cs: ["Palivo", "Dojezd na palivo", "Spotřeba paliva"], sk: ["Palivo", "Dojazd na palivo", "Spotreba paliva"],
  hu: ["Üzemanyag", "Üzemanyag-hatótáv", "Üzemanyag-fogyasztás"], ro: ["Combustibil", "Autonomie combustibil", "Consum combustibil"],
  sl: ["Gorivo", "Doseg z gorivom", "Poraba goriva"], hr: ["Gorivo", "Doseg goriva", "Potrošnja goriva"],
};

for (const [language, [fuel, fuelRange, fuelConsumption]] of Object.entries(CAPABILITY_LABELS)) {
  FRONTEND_TEXT.vehicleOverview[language] = {
    ...FRONTEND_TEXT.vehicleOverview.en,
    ...FRONTEND_TEXT.vehicleOverview[language],
    fuel,
  };
  FRONTEND_TEXT.dashboard[language] = {
    ...FRONTEND_TEXT.dashboard.en,
    ...FRONTEND_TEXT.dashboard[language],
    fuel,
    fuelRange,
    fuelConsumption,
  };
}

export { FRONTEND_TEXT, languageFor, localeFor, textFor };
