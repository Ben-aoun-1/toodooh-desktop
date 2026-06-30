#ifndef _MQTTCLIENT_H
#define _MQTTCLIENT_H

#ifdef HAS_MQTT

#include "globals.h"
#include "rcommand.h"
#include "hash.h"
#include <MQTT.h>
#include <WiFi.h>
#include <mbedtls/base64.h>

#ifndef MQTT_CLIENTNAME
#define MQTT_CLIENTNAME clientId
#endif

extern TaskHandle_t mqttTask;
extern bool mqttConnected;

void mqtt_enqueuedata(MessageBuffer_t *message);
uint32_t mqtt_queuewaiting(void);
void mqtt_queuereset(void);
void mqtt_client_task(void *param);
int mqtt_connect(const char *my_host, const uint16_t my_port);
void mqtt_callback(MQTTClient *client, char *topic, char *payload, int length);
esp_err_t mqtt_init(void);
void mqtt_deinit(void);

#endif

#endif // _MQTTCLIENT_H