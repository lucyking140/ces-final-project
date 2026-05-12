#include <Arduino.h>

const int LED_PINS[] = { 2, 32, 25, 27, 13, 15 };
const int NUM_LEDS = sizeof(LED_PINS) / sizeof(LED_PINS[0]);

const int NUM_BITS = 7;
const unsigned long BIT_DURATION_MS = 500;
const unsigned long BLANK_DURATION_MS = 200;

// PWM config
const int PWM_FREQ = 5000;
const int PWM_RESOLUTION = 8; // 8-bit: 0-255
// Assign one LEDC channel per LED pin
const int PWM_CHANNELS[] = { 0, 1, 2, 3, 4, 5 };

// Capacitive touch
const int TOUCH_PIN = 33;        // T8
const int TOUCH_THRESHOLD = 40;
const unsigned long TOUCH_COOLDOWN_MS = 1500;

const unsigned long FADE_DURATION_MS = 2000;

bool busy = false;
unsigned long lastTouchTime = 0;

void setupPWM() {
  for (int i = 0; i < NUM_LEDS; i++) {
    ledcSetup(PWM_CHANNELS[i], PWM_FREQ, PWM_RESOLUTION);
    ledcAttachPin(LED_PINS[i], PWM_CHANNELS[i]);
    ledcWrite(PWM_CHANNELS[i], 0);
  }
}

void setAllPWM(int value) {
  for (int i = 0; i < NUM_LEDS; i++) {
    ledcWrite(PWM_CHANNELS[i], value);
  }
}

void setAllDigital(bool on) {
  for (int i = 0; i < NUM_LEDS; i++) {
    ledcWrite(PWM_CHANNELS[i], on ? 255 : 0);
  }
}

void showBit(int bit) {
  for (int i = 0; i < NUM_LEDS; i++) {
    if (bit == 1) {
      ledcWrite(PWM_CHANNELS[i], i < 2 ? 255 : 0);
    } else {
      ledcWrite(PWM_CHANNELS[i], 255);
    }
  }
}

void clearAll() {
  setAllPWM(0);
}

// Fade all LEDs from off to full brightness
void fadeInAll() {
  unsigned long start = millis();
  while (true) {
    unsigned long elapsed = millis() - start;
    if (elapsed >= FADE_DURATION_MS) break;
 
    float t = (float)elapsed / FADE_DURATION_MS;
    float curved = t * t * t;                     // cubic ease-in
    int brightness = (int)(curved * 255);
 
    setAllPWM(brightness);
 
    if (Serial.available() > 0) {
      char c = Serial.read();
      if (c != '\r' && c != '\n') Serial.println("BEEP");
    }
    delay(5);
  }
  setAllPWM(255);
  delay(300);
  clearAll();
}

// Non-blocking wait that sends BEEP for any keypress received during display
void waitAndCheck(unsigned long duration) {
  unsigned long start = millis();
  while (millis() - start < duration) {
    if (Serial.available() > 0) {
      char c = Serial.read();
      if (c != '\r' && c != '\n') Serial.println("BEEP");
    }
  }
}

void displayCharBits(char c) {
  busy = true;
  Serial.printf("Displaying '%c' (ASCII %d, binary ", c, c);
  for (int b = NUM_BITS - 1; b >= 0; b--) {
    Serial.print((c >> b) & 1);
  }
  Serial.println(")");

  for (int b = NUM_BITS - 1; b >= 0; b--) {
    int bit = (c >> b) & 1;
    Serial.printf("  Bit %d: %d\n", NUM_BITS - b, bit);
    showBit(bit);
    waitAndCheck(BIT_DURATION_MS);
    clearAll();
    waitAndCheck(BLANK_DURATION_MS);
  }

  busy = false;
}

void setup() {
  Serial.begin(115200);
  setupPWM();

  delay(1000);
  while (Serial.available() > 0) Serial.read();

  Serial.println("Ready! Type any character to display its ASCII value in binary.");
  Serial.println("  '1' bit -> LEDs 1 & 2 on");
  Serial.println("  '0' bit -> all 6 LEDs on");
  Serial.println("  Touch pin 33 -> fade all LEDs + TOUCH sound");
}

void loop() {
  // Check capacitive touch
  if (!busy) {
    unsigned long now = millis();
    if (now - lastTouchTime > TOUCH_COOLDOWN_MS) {
      int touchVal = touchRead(TOUCH_PIN);
      if (touchVal < TOUCH_THRESHOLD) {
        lastTouchTime = now;
        Serial.println("TOUCH");
        fadeInAll();
      }
    }
  }

  // Check serial input
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\r' || c == '\n') return;
    displayCharBits(c);
  }
}