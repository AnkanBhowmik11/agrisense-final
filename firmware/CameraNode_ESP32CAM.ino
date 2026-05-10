/*
 * AgriSense — Camera Node (ESP32-CAM)
 * ─────────────────────────────────────
 * Board: AI Thinker ESP32-CAM
 *
 * Role:
 *   - Connects to your Home Wi-Fi network.
 *   - Serves MJPEG stream at http://<ASSIGNED_IP>:81/stream
 *   - Note the IP address in the Serial Monitor and put it in agrisense_vision_backend.py
 *
 * Board setting in Arduino IDE: "AI Thinker ESP32-CAM"
 */

#include "esp_camera.h"
#include "esp_http_server.h"
#include "WiFi.h"

// ─── Home Wi-Fi Credentials ───────────────────────────────────────────────────
#define WIFI_SSID  "Jiofiber-4gh"
#define WIFI_PASS  "bharat@9051"

// AI-Thinker ESP32-CAM pin map (do NOT change)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

static camera_config_t cam_cfg = {
  .pin_pwdn     = PWDN_GPIO_NUM,  .pin_reset    = RESET_GPIO_NUM,
  .pin_xclk     = XCLK_GPIO_NUM,
  .pin_sscb_sda = SIOD_GPIO_NUM,  .pin_sscb_scl = SIOC_GPIO_NUM,
  .pin_d7 = Y9_GPIO_NUM, .pin_d6 = Y8_GPIO_NUM, .pin_d5 = Y7_GPIO_NUM,
  .pin_d4 = Y6_GPIO_NUM, .pin_d3 = Y5_GPIO_NUM, .pin_d2 = Y4_GPIO_NUM,
  .pin_d1 = Y3_GPIO_NUM, .pin_d0 = Y2_GPIO_NUM,
  .pin_vsync = VSYNC_GPIO_NUM, .pin_href = HREF_GPIO_NUM, .pin_pclk = PCLK_GPIO_NUM,
  .xclk_freq_hz  = 20000000,
  .ledc_timer    = LEDC_TIMER_0,
  .ledc_channel  = LEDC_CHANNEL_0,
  .pixel_format  = PIXFORMAT_JPEG,
  .frame_size    = FRAMESIZE_VGA,   // 640×480
  .jpeg_quality  = 14,              
  .fb_count      = 2,
  .grab_mode     = CAMERA_GRAB_WHEN_EMPTY
};

static esp_err_t streamHandler(httpd_req_t *req) {
  camera_fb_t *fb = NULL;
  char part_buf[64];
  httpd_resp_set_type(req, "multipart/x-mixed-replace; boundary=frame");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) break;
    snprintf(part_buf, 64, "Content-Length: %u\r\n\r\n", (uint32_t)fb->len);
    if (httpd_resp_send_chunk(req, "\r\n--frame\r\nContent-Type: image/jpeg\r\n", 37) != ESP_OK) break;
    if (httpd_resp_send_chunk(req, part_buf, strlen(part_buf)) != ESP_OK) break;
    if (httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len) != ESP_OK) break;
    esp_camera_fb_return(fb);
    fb = NULL;
  }
  if (fb) esp_camera_fb_return(fb);
  return ESP_OK;
}

static esp_err_t captureHandler(httpd_req_t *req) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }
  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, OPTIONS");
  httpd_resp_set_hdr(req, "Content-Disposition", "attachment; filename=agrisense.jpg");
  httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return ESP_OK;
}

static void startCamServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  
  httpd_handle_t server = NULL;
  if (httpd_start(&server, &config) == ESP_OK) {
    httpd_uri_t capture_uri = { .uri = "/capture", .method = HTTP_GET, .handler = captureHandler };
    httpd_register_uri_handler(server, &capture_uri);
    Serial.println("[CAM] Control server started on port 80 (/capture)");
  }

  config.server_port = 81;
  config.ctrl_port = 32769; 
  httpd_handle_t stream_server = NULL;
  if (httpd_start(&stream_server, &config) == ESP_OK) {
    httpd_uri_t stream_uri  = { .uri = "/stream",  .method = HTTP_GET, .handler = streamHandler  };
    httpd_register_uri_handler(stream_server, &stream_uri);
    Serial.println("[CAM] Stream server started on port 81 (/stream)");
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== AgriSense Camera Node ===");

  if (esp_camera_init(&cam_cfg) != ESP_OK) {
    Serial.println("[CAM] Camera init FAILED — check ribbon cable & 5V supply");
    return;
  }
  Serial.println("[CAM] Camera OK");

  // Hardcoded IP for JioFiber (192.168.29.x)
  IPAddress local_IP(192, 168, 29, 201);
  IPAddress gateway(192, 168, 29, 1);
  IPAddress subnet(255, 255, 255, 0);
  IPAddress primaryDNS(8, 8, 8, 8);
  IPAddress secondaryDNS(8, 8, 4, 4);

  // Join the Home Wi-Fi
  WiFi.mode(WIFI_STA);
  if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
    Serial.println("STA Failed to configure");
  }
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[WiFi] Joining '%s'", WIFI_SSID);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - t0 > 25000) {
      Serial.println("\n[WiFi] Timeout — could not join AP. Please restart.");
      return;
    }
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n[WiFi] Connected!");
  Serial.printf("[CAM] IP Address: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[CAM] Stream URL: http://%s:81/stream\n", WiFi.localIP().toString().c_str());

  startCamServer();
}

void loop() {
  delay(1000);  
}