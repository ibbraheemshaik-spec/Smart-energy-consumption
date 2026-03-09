// ================================================================
//  ESP32 AC Voltage / Current Monitor — Dashboard Edition
//  This code runs exactly as the original version but prints a 
//  link to your local Node.js web dashboard in the Serial Monitor.
//
//  HOW IT WORKS:
//    1. Open Arduino IDE Serial Monitor (115200 baud).
//    2. It connects to Wi-Fi and Blynk normally.
//    3. It prints "Dashboard available at: http://10.63.113.84:3000".
//    4. The Node.js server reads the same Serial lines and 
//       creates the real-time webpage automatically!
// ================================================================

#define BLYNK_TEMPLATE_ID   "TMPL3re7m8t23"
#define BLYNK_TEMPLATE_NAME "ESP32 AC Voltage"
#define BLYNK_AUTH_TOKEN    "1nOup4w4DRubR8h-jLWpXGlb7TtgY8EM"

#include <WiFi.h>
#include <BlynkSimpleEsp32.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <math.h>

// ── WiFi credentials ───────────────────────────────────────────
char ssid[] = "abcd";
char pass[] = "123456789";

#define VOLTAGE_PIN 35
#define CURRENT_PIN 34

LiquidCrystal_I2C lcd(0x27, 16, 2);

float voltageCalibration = 720.0;
float currentCalibration = 20.0;
int   currentOffset      = 0;

BlynkTimer timer;

// ================================================================
//  SENSOR READING FUNCTION
// ================================================================
void sendSensor()
{
  long voltageSum = 0;
  long currentSum = 0;
  int  samples    = 800;

  for (int i = 0; i < samples; i++) {
    int v_adc    = analogRead(VOLTAGE_PIN);
    int v_center = v_adc - 2048;
    voltageSum  += (long)v_center * v_center;

    int c_adc    = analogRead(CURRENT_PIN);
    int c_center = c_adc - currentOffset;
    currentSum  += (long)c_center * c_center;
  }

  float v_rms = sqrt((float)voltageSum / samples);
  float c_rms = sqrt((float)currentSum / samples);

  float voltage = (v_rms * 3.3 / 4095.0) * voltageCalibration;
  float current = (c_rms * 3.3 / 4095.0) * currentCalibration;

  if (voltage < 100)  voltage = 0;
  if (current < 0.02) current = 0;

  float power = voltage * current;

  // ── Serial output for the Arduino IDE & Node.js Server ──
  Serial.print("V: "); Serial.println(voltage);
  Serial.print("I: "); Serial.println(current);

  // Print the dashboard URL link every 10 seconds (every 5th reading) 
  // so it's always easy to click in the Serial Monitor.
  static int counter = 0;
  if (counter++ % 5 == 0) {
    Serial.println("\n🌐 Dashboard available at: http://10.224.223.84:3000\n");
  }

  // ── LCD display ─────────────────────────────────────────
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("V:"); lcd.print(voltage, 1); lcd.print("V");
  lcd.setCursor(0, 1);
  lcd.print("I:"); lcd.print(current, 2); lcd.print("A");

  // ── Send to Blynk ───────────────────────────────────────
  Blynk.virtualWrite(V0, voltage);
  Blynk.virtualWrite(V1, current);
  Blynk.virtualWrite(V2, power);
}

// ================================================================
//  SETUP
// ================================================================
void setup()
{
  Serial.begin(115200);

  // ── Print Dashboard Link immediately on boot ────────────
  Serial.println("\n\n================================================");
  Serial.println("🌐 DASHBOARD LINK: http://10.224.223.84:3000");
  Serial.println("================================================\n");

  // ── LCD init ────────────────────────────────────────────
  lcd.begin();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("AC Monitor");
  lcd.setCursor(0, 1); lcd.print("Starting...");
  delay(2000);
  lcd.clear();

  // ── Connect to WiFi + Blynk ─────────────────────────────
  Blynk.begin(BLYNK_AUTH_TOKEN, ssid, pass);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Blynk Connected");
  delay(2000);
  lcd.clear();

  // ── Measure current offset (no-load calibration) ────────
  long offsetSum = 0;
  for (int i = 0; i < 1000; i++) {
    offsetSum += analogRead(CURRENT_PIN);
    delay(2);
  }
  currentOffset = offsetSum / 1000;
  Serial.print("Current Offset: "); Serial.println(currentOffset);

  // ── Timer: read sensors every 2 seconds ─────────────────
  timer.setInterval(2000L, sendSensor);
}

// ================================================================
//  LOOP
// ================================================================
void loop()
{
  Blynk.run();
  timer.run();
}
