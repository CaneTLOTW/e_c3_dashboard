# Notifications and wake-up

## Explicit opt-in

The e-C3 Dashboard package creates **no active notification route and no
automatic wake-up on installation**. This is intentional: installing a HACS
repository must never message a household or wake its vehicle.

To enable notifications, open **Settings → Devices & services → e-C3 Dashboard
→ Configure**. Enable *Notification and recipient controls* and select one or
more existing `notify` services using the typed multi-select field. The package
does not know names such as a partner, a tablet, Telegram, or a mobile phone.

After reloading the entry, the generated **Notifications** view has these
independent switches, all initially off:

1. **Notifications** – master consent switch.
2. **Vehicle alerts**, **Trip reports**, and **Charge reports** – topic
   switches.
3. One recipient switch for every Notify service selected in the options form.

A notification is sent only when the master switch, its topic switch and at
least one recipient switch are all on. The test button follows the master and
recipient switches, but does not require a topic switch.

Removing a recipient in the options form removes its switch on the next entry
reload and prevents further deliveries to it. No credentials, device IDs,
phone names, Telegram configuration, or recipient selections are stored in the
repository.

## Preserved notification content

For a German Home Assistant installation, the package uses the established
vehicle messages unchanged in meaning and field content:

| Trigger | Title | Content |
| --- | --- | --- |
| Completed trip | `Fahrt beendet` | Distance, duration, average speed, start/end SOC, estimated energy and estimated kWh/100 km. |
| Charging begins and a usable estimate exists after 10 minutes | `Laden gestartet` | Start/current SOC, estimated remaining time and end time, estimate source, AC/DC type. |
| Completed charge | `Ladevorgang beendet` | Duration, start/end SOC, estimated energy, average/maximum estimated kW, AC/DC type. |
| Range below 25 km | `Reichweite niedrig` | Remaining range and SOC. Reset above 30 km. |
| At home, below 30% SOC for 20 minutes | `Laden empfohlen` | SOC and remaining range. Reset after charging, leaving home, or above 35%. |
| Service battery below 50% | `12-V-Batterie niedrig` | Reported percentage and a wake-up/state reminder. Reset above 55%. |
| Stale vehicle data | `Fahrzeug nicht erreichbar` | Data age and the result of the optional wake-up probe. |
| Fresh data after a reported outage | `Fahrzeug wieder verbunden` | Outage duration, SOC and range. |

Energy and power values are the same battery-side estimates described in the
entity catalog. They are not charger-meter readings and exclude charging
losses.

## Wake-up controls

The **Wake-up** view also starts fully inactive:

- **Wake vehicle now** is a package button that invokes the selected upstream
  Stellantis wake-up button and records a package Logbook entry.
- **Hourly wake-up** wakes an idle, non-charging vehicle at most once per hour.
- **Wake-up while charging** wakes an actively charging vehicle at most once
  every five minutes.
- **Availability probe** requests one wake-up after the data-age threshold is
  crossed: three hours for an idle vehicle at home and two hours otherwise.
  A missing response is reported only after the 15-minute probe wait.

The schedule controls are independent from notification consent. They do not
send messages by themselves. The availability warning/recovery message still
requires Notifications, Vehicle alerts, and a recipient to be enabled.

## Persistence and removal

Recipient switches, one-time warning markers, the last notification and
wake-up counters are stored per config entry in Home Assistant private storage
and survive restarts. Removing the e-C3 Dashboard config entry removes its
entities and stops its listeners. It never removes upstream Stellantis entities
or changes the user’s Notify integration, Recorder settings, or existing
household automations.
