# Raah Node sensor thresholds: what raises what, and why

Calibration of 2026-10-24 (log.md L-050). The same numbers are in four places, which must change together:

- `Backend/app/node_sensors.py` (server)
- `Hardware/raah_node/raah_node.ino` (firmware)
- `Backend/tools/mock_node.py` (mock)
- `Frontend/src/pages/Sensors.jsx` (screen)

> Bench-calibrated prototype values for a tabletop slope model. They are **not** field thresholds; see "Before a real deployment" below.

## 1. The rule in one line

**Only the tilt sensor can raise an ALARM.** Vibration and soil moisture can raise at most a WARNING. The rain plate can raise at most a WATCH.

| Sensor | WATCH | WARNING | ALARM |
|---|---|---|---|
| Tilt angle (MPU6050) | ≥ 2° | ≥ 5° | **≥ 8°** |
| Tilt rate (MPU6050) | – | ≥ 3°/min | **≥ 8°/min** |
| Vibration (MPU6050) | – | RMS ≥ 0.10 g, or a knock (peak) ≥ 0.35 g | never |
| Soil moisture (LM393, GPIO34) | ≥ 50 % | ≥ 70 % (saturated) | never |
| Rain plate (LM393, GPIO35) | wet (≥ 50 % of the dry→wet range) | – | never |

**Saturated soil makes tilt more sensitive.** At ≥ 70 % moisture, all tilt and tilt-rate thresholds are multiplied by 0.6:
- WATCH at 1.2°;
- WARNING at 3° or 1.8°/min;
- ALARM at 4.8° or 4.8°/min.

So wet soil brings the alarm closer, but the alarm itself still needs the slope to move.

**Enforcement:**
- **The node's own state:** the firmware applies these rules. If any firmware (old, third-party, or a team member's test sketch) sends `ALARM` without a tilt or tilt rate at ALARM level, the backend lowers it to `WARNING`. It records `state_capped_from: "ALARM"`, which is visible on the Sensors page and in the sensor log.
- **Raw readings:** if the node sends only raw values, the backend applies the same table itself.

**What each level does on NH-7:**
- **WARNING:** the stretch becomes at least High, and the trip planner says CAUTION.
- **ALARM:** the stretch becomes Very High, the planner says AVOID, and one Telegram/SMS message is sent per incident.

## 2. Why only tilt raises the alarm (what to tell a judge)

1. **An alarm should mean "the ground is moving now."** Tilt of the slope surface is a direct measure of deformation. Accelerating movement is the classic precursor of slope failure:
   - Saito's creep method (1965) and Fukuzono's inverse-velocity method (1985) forecast failure time from the rate of movement;
   - Intrieri et al. (2019) review these rate-based methods;
   - Uchimura et al. (2010) showed that a cheap MEMS tilt sensor on the slope surface responds before failure. In their model tests, rotation appeared about 30 minutes before collapse.

   That is why both the tilt angle and the **tilt rate** can raise the ALARM.

2. **Vibration on a highway is not specific to landslides.** Trucks, buses, road works, blasting and falling stones all shake a roadside node. A single MEMS accelerometer cannot tell them apart. An ALARM from vibration would send AVOID messages for every heavy truck. Repeated false alarms make people ignore real ones, and this is why early-warning design weighs false-alarm rates explicitly (Sättele et al., 2016). Vibration is still useful as **supporting evidence**, so it raises a WARNING (CAUTION) and is logged.

3. **Wet soil is a condition, not a failure.** Rain soaking in raises pore-water pressure and lowers effective stress, so the soil's shear strength drops (Terzaghi's effective stress principle). This is why rainfall and antecedent wetness are used to set landslide *warning* levels (Baum & Godt, 2010). But a saturated slope is normal in the monsoon and usually does not fail. So moisture raises a WARNING and makes tilt more sensitive (×0.6); it does not alarm by itself.

   The same pairing, a tilt sensor plus a soil water sensor on one unit, is the design of Uchimura et al. (2010).

4. **Tiered alerts follow fielded systems.** The Amrita University wireless sensor network in Idukki, Kerala, India used rain, moisture, pore pressure, tilt and other sensors with a three-level warning (Early, Intermediate, Imminent). It issued a real warning in the July 2009 monsoon (Ramesh, 2014). Raah's WATCH / WARNING / ALARM follows the same idea, with the top level reserved for direct evidence of movement.

## 3. Where the numbers come from

**Tilt, tilt rate, vibration, the 70 % saturation point and the 0.6 factor.** These come from the team's 48-hour build workflow (`navdhara_implementation.pdf`, §4.2). They are sized for a **bench slope model**, so a hand-tilted tray or a small soil box moves through WATCH, WARNING and ALARM visibly within minutes during a demo.

Field systems use far smaller rates: Uchimura et al. (2010) propose a precaution at 0.01°/h and a warning at 0.1°/h. That is the main thing to change before field use (section 4).

**Vibration levels.** At rest, the MPU6050 accelerometer's noise is tiny. The noise density is about 400 µg/√Hz; check the TDK InvenSense datasheet. With the firmware's ~44 Hz low-pass filter, that is roughly 3 mg RMS. So:
- 0.10 g RMS is about 30× sensor noise: only real shaking crosses it;
- a 0.35 g peak is a sharp knock, such as a stone hitting the post.

**Soil and rain ADC calibration.** These are the team's bench measurements on the 12-bit ESP32 ADC:

| Board | Dry | Wet |
|---|---|---|
| Soil probe (GPIO34) | 4095 | ≈ 1250 (in water) |
| Rain plate (GPIO35) | 4095 | ≈ 2400 |

"Moisture %" is the position between those two readings, not volumetric water content. The resistive LM393 probe is not calibrated to VWC. 50 % is "clearly moist"; 70 % is "near the in-water reading", treated as saturated. The rain plate counts as wet at half of its dry→wet range.

## 4. Before a real deployment (say this too)

These values have **not been validated in the field**. For a real NH-7 site:

1. **Record a baseline for a few weeks.** Every reading is already kept in the daily sensor log (Admin → Sensor log; `GET /admin/node-logs`). The baseline should cover traffic vibration and normal temperature drift of the tilt reading.
2. **Set thresholds from that data,** for example baseline + k·σ for vibration, and tilting rates in degrees per hour in line with Uchimura et al. rather than degrees per minute.
3. **Calibrate the soil probe in the site's own soil,** or replace it with a capacitive or VWC sensor.
4. **Review every ALARM and WARNING against site inspections,** and adjust the thresholds.

## References

1. Saito, M. (1965). Forecasting the time of occurrence of a slope failure. *Proc. 6th Int. Conf. on Soil Mechanics and Foundation Engineering*, Montreal, vol. 2, 537–541.
2. Fukuzono, T. (1985). A new method for predicting the failure time of a slope. *Proc. 4th Int. Conf. and Field Workshop on Landslides*, Tokyo, 145–150.
3. Uchimura, T., Towhata, I., Trinh, T. L. A., et al. (2010). Simple monitoring method for precaution of landslides watching tilting and water contents on slopes surface. *Landslides* 7(3), 351–357. https://doi.org/10.1007/s10346-009-0178-z
4. Uchimura, T., Towhata, I., Wang, L., et al. (2015). Precaution and early warning of surface failure of slopes using tilt sensors. *Soils and Foundations* 55(5), 1086–1099. https://doi.org/10.1016/j.sandf.2015.09.010
5. Ramesh, M. V. (2014). Design, development, and deployment of a wireless sensor network for detection of landslides. *Ad Hoc Networks* 13, 2–18.
6. Baum, R. L., & Godt, J. W. (2010). Early warning of rainfall-induced shallow landslides and debris flows in the USA. *Landslides* 7, 259–272.
7. Intrieri, E., Carlà, T., & Gigli, G. (2019). Forecasting the time of failure of landslides at slope-scale: a literature review. *Earth-Science Reviews* 193, 333–349.
8. Sättele, M., Bründl, M., & Straub, D. (2016). Quantifying the effectiveness of early warning systems for natural hazards. *Natural Hazards and Earth System Sciences* 16, 149–166.
9. Terzaghi, K. (1943). *Theoretical Soil Mechanics*. Wiley. (Effective stress principle.)
10. TDK InvenSense. *MPU-6000 and MPU-6050 Product Specification*, rev. 3.4. (Accelerometer noise density.)
11. Team document: *Raah Node 48-hour build workflow* (`navdhara_implementation.pdf`), §4.2.

Checked online on 2026-10-24:
- references 3, 4 and 5;
- the 0.01°/h and 0.1°/h rates in ref. 3;
- the MPU6050 noise figure (third-party summaries of ref. 10).

Check page numbers and the datasheet against the originals before printing them on a poster.
