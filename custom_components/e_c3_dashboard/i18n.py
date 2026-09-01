"""Small, explicit translation catalog for server-side package messages.

Home Assistant loads ``translations/*.json`` for config and options flows.
Notifications and Logbook messages run on the backend, however, and must be
rendered before they are handed to the Notify service. Keeping those strings
here avoids scattering language branches through the business logic.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant


_MESSAGES: dict[str, dict[str, str]] = {
    "de": {
        "manual_wakeup": "Manueller Wake-up angefordert",
        "test_title": "e-C3 Dashboard-Test",
        "test_message": "Dieser Test bestätigt die ausgewählten e-C3-Dashboard-Benachrichtigungsempfänger.",
        "trip_title": "Fahrt beendet",
        "trip_message": "{distance} km in {duration}, Ø {average_speed} km/h. SOC {soc_start} → {soc_end} %, geschätzt {energy} kWh bzw. {consumption} kWh/100 km.",
        "charge_completed_title": "Ladevorgang beendet",
        "charge_completed_message": "{duration}, SOC {soc_start} → {soc_end} %, geschätzt {energy} kWh. Ø {average_power} kW, max. {maximum_power} kW, {charge_type}.",
        "range_low_title": "Reichweite niedrig",
        "range_low_message": "Restreichweite {range} km bei {soc} % SOC.",
        "charge_recommended_title": "Laden empfohlen",
        "charge_recommended_message": "Das Fahrzeug steht zu Hause mit {soc} % SOC und {range} km Reichweite.",
        "service_battery_low_title": "12-V-Batterie niedrig",
        "service_battery_low_message": "Die Stellantis-Service-Batterie meldet {level} %. Wake-up-Häufigkeit und Fahrzeugzustand prüfen.",
        "availability_restored_title": "Fahrzeug wieder verbunden",
        "availability_restored_message": "Nach etwa {minutes} Minuten liegen wieder frische Fahrzeugdaten vor. SOC {soc} %, Reichweite {range} km.",
        "availability_probe": "Erreichbarkeitsprobe angefordert",
        "availability_outage_title": "Fahrzeug nicht erreichbar",
        "availability_outage_message": "Seit etwa {hours} Stunden liegen keine frischen Fahrzeugdaten vor. Ein Wake-up-Probeversuch blieb ohne neue Daten.",
        "charge_started_title": "Laden gestartet",
        "charge_started_message": "Start bei {start_soc} %, aktuell {soc} %. Voraussichtlich noch {duration}, Ende {end} (SOC-Verlauf, {charge_type}).",
        "wakeup_charging": "Wake-up während des Ladens angefordert",
        "wakeup_hourly": "Stündlicher Wake-up angefordert",
        "today_at": "heute {time}",
        "tomorrow_at": "morgen {time}",
        "unknown": "Unbekannt",
    },
    "en": {
        "manual_wakeup": "Manual wake-up requested",
        "test_title": "e-C3 Dashboard test",
        "test_message": "This test confirms the selected e-C3 Dashboard notification recipients.",
        "trip_title": "Trip completed",
        "trip_message": "{distance} km in {duration}, avg. {average_speed} km/h. SOC {soc_start} → {soc_end} %, estimated {energy} kWh or {consumption} kWh/100 km.",
        "charge_completed_title": "Charging completed",
        "charge_completed_message": "{duration}, SOC {soc_start} → {soc_end} %, estimated {energy} kWh. Avg. {average_power} kW, max. {maximum_power} kW, {charge_type}.",
        "range_low_title": "Low range",
        "range_low_message": "Remaining range {range} km at {soc}% SOC.",
        "charge_recommended_title": "Charging recommended",
        "charge_recommended_message": "The vehicle is at home with {soc}% SOC and {range} km of range.",
        "service_battery_low_title": "Low 12 V battery",
        "service_battery_low_message": "The Stellantis service battery reports {level}%. Check wake-up frequency and vehicle state.",
        "availability_restored_title": "Vehicle connected again",
        "availability_restored_message": "Fresh vehicle data is available again after about {minutes} minutes. SOC {soc}%, range {range} km.",
        "availability_probe": "Availability probe requested",
        "availability_outage_title": "Vehicle unavailable",
        "availability_outage_message": "No fresh vehicle data has been available for about {hours} hours. A wake-up probe did not result in new data.",
        "charge_started_title": "Charging started",
        "charge_started_message": "Started at {start_soc}%, currently {soc}%. Estimated remaining time {duration}; finish {end} (SOC history, {charge_type}).",
        "wakeup_charging": "Wake-up during charging requested",
        "wakeup_hourly": "Hourly wake-up requested",
        "today_at": "today {time}",
        "tomorrow_at": "tomorrow {time}",
        "unknown": "Unknown",
    },
    "fr": {
        "manual_wakeup": "Réveil manuel demandé",
        "test_title": "Test e-C3 Dashboard",
        "test_message": "Ce test confirme les destinataires de notification sélectionnés pour e-C3 Dashboard.",
        "trip_title": "Trajet terminé",
        "trip_message": "{distance} km en {duration}, moy. {average_speed} km/h. SOC {soc_start} → {soc_end} %, énergie estimée {energy} kWh, soit {consumption} kWh/100 km.",
        "charge_completed_title": "Recharge terminée",
        "charge_completed_message": "{duration}, SOC {soc_start} → {soc_end} %, énergie estimée {energy} kWh. Puissance moy. {average_power} kW, max. {maximum_power} kW, {charge_type}.",
        "range_low_title": "Autonomie faible",
        "range_low_message": "Autonomie restante {range} km avec {soc} % de SOC.",
        "charge_recommended_title": "Recharge recommandée",
        "charge_recommended_message": "Le véhicule est à domicile avec {soc} % de SOC et {range} km d’autonomie.",
        "service_battery_low_title": "Batterie 12 V faible",
        "service_battery_low_message": "La batterie de service Stellantis indique {level} %. Vérifiez la fréquence des réveils et l’état du véhicule.",
        "availability_restored_title": "Véhicule de nouveau connecté",
        "availability_restored_message": "Des données récentes du véhicule sont de nouveau disponibles après environ {minutes} minutes. SOC {soc} %, autonomie {range} km.",
        "availability_probe": "Test de disponibilité demandé",
        "availability_outage_title": "Véhicule indisponible",
        "availability_outage_message": "Aucune donnée récente du véhicule n’est disponible depuis environ {hours} heures. Un essai de réveil n’a produit aucune nouvelle donnée.",
        "charge_started_title": "Recharge démarrée",
        "charge_started_message": "Départ à {start_soc} %, actuellement {soc} %. Temps restant estimé {duration}, fin {end} (historique SOC, {charge_type}).",
        "wakeup_charging": "Réveil pendant la recharge demandé",
        "wakeup_hourly": "Réveil horaire demandé",
        "today_at": "aujourd’hui à {time}",
        "tomorrow_at": "demain à {time}",
        "unknown": "Inconnu",
    },
}


def language_for(hass: HomeAssistant) -> str:
    """Return the supported language selected for this HA instance."""
    requested = str(hass.config.language or "en").lower()
    if requested.startswith("de"):
        return "de"
    if requested.startswith("fr"):
        return "fr"
    return "en"


def text(hass: HomeAssistant, key: str, **values: Any) -> str:
    """Return one translated server-side message, optionally formatted."""
    return _MESSAGES[language_for(hass)][key].format(**values)
