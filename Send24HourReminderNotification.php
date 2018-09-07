<?php

namespace App\Jobs;

use App\Models\V1\Appointment;
use DateTime;
use DateTimeZone;
use DateInterval;
use Log;
use Illuminate\Contracts\Queue\ShouldQueue;
use Event as AppEvent;
use App\Events\V1\ReportingEvent;

class Send24HourReminderNotification extends SNSJob implements ShouldQueue
{
    protected $appointment = null;

    /**
     * Create a new job instance.
     * @param App\Models\V1\Appointment $appointment The appointment model for which to send the notificaiton
     */
    public function __construct(Appointment $appointment)
    {
        $this->appointment = $appointment;
    }

    /**
     * Execute the job.
     */
    public function handle()
    {
        $client = $this->getSnsClient();
        $appointment = $this->appointment;
        $location = $appointment->location;

        if ($location && $location->timezone) {
            $timezone = new DateTImeZone($location->timezone);
        } else {
            $timezone = new DateTImeZone('America/New_York');
        }

        if ((int) $appointment->session_number === 1) {
            $message = 'Time to plan how you are getting to your first session!';
        } else {
            $now = new DateTIme();
            $now->setTimeZone($timezone);
            $tomorrow = new DateTIme();
            $tomorrow->setTimeZone($timezone);
            $tomorrow->add(new DateInterval('P1D'));
            if (is_object($appointment->date_time)) {
                $appointmentTime = $appointment->date_time;
            } else {
                $appointmentTime = new DateTIme($appointment->date_time, $timezone);
            }

            if ($now->format('m-d') === $appointmentTime->format('m-d')) {
                $day = 'today';
            } elseif ($tomorrow->format('m-d') === $appointmentTime->format('m-d')) {
                $day = 'tomorrow';
            } else {
                $day = $appointmentTime->format('l, F jS');
            }

            $address = trim(
                $location->address.
                ($location->address2 ? ' '.$location->address2 : '').', '.
                $location->city.', '.
                $location->state.' '.
                $location->postal_code
            );

            if ($appointment->participant->child) {
                $childName = $appointment->participant->child->name;
            } else {
                $childName = 'your child';
            }

            $message = sprintf(
                'Your next session with %s is %s at %s, at %s.',
                $childName,
                $day,
                $appointmentTime->format('g:i A'),
                $address
            );
        }

        Log::info('Sending push notification: '.$message);

        $iOSMessageData = [
            'aps' => (object) [
                'alert' => $message,
                'badge' => 1,
                'sound' => 'default',
            ],
            'module' => 'A',
            'session_number' => $appointment->session_number,
            'date_time' => $appointment->date_time,
            'facilitator' => null,
            'location' => (object) [],
        ];

        $androidMessageData = [
            'message' => $message,
            'module' => 'A',
            'session_number' => $appointment->session_number,
            'date_time' => $appointment->date_time,
            'facilitator' => null,
            'location' => (object) [],
        ];

        if ($appointment->facilitator) {
            $iOSMessageData['facilitator'] = $appointment->facilitator->first_name.' '.$appointment->facilitator->last_name;
            $androidMessageData['facilitator'] = $appointment->facilitator->first_name.' '.$appointment->facilitator->last_name;
        }

        if ($location) {
            $iOSMessageData['location'] = (object) [
                'address' => $location->address,
                'address2' => $location->address2,
                'city' => $location->city,
                'state' => $location->state,
                'zip' => $location->postal_code,
            ];
            $androidMessageData['location'] = (object) [
                'address' => $location->address,
                'address2' => $location->address2,
                'city' => $location->city,
                'state' => $location->state,
                'zip' => $location->postal_code,
            ];
        }

        $data = (object) [
            'default' => $message,
            'GCM' => json_encode((object) [
                'data' => (object) $androidMessageData,
            ]),
            'APNS' => json_encode((object) $iOSMessageData),
        ];

        foreach ($appointment->participant->user->devices as $device) {
            if ($device->endpoint) {
                Log::info('Sending to device: '.$device->endpoint);
                try {
                    $result = $client->publish([
                        'TargetArn' => $device->endpoint,
                        'Message' => json_encode($data),
                        'MessageStructure' => 'json',
                    ]);
                    if ($result['MessageId']) {
                        // Log the notification submission
                        $appointment->participant->user->notifications()->create([
                            'status' => 'submitted',
                            'message_id' => $result['MessageId'],
                            'message_text' => $message,
                            'session_number' => $appointment->session_number,
                        ]);
                    } else {
                        // Log the notification failure
                        $appointment->participant->user->notifications()->create([
                            'status' => 'failed',
                            'message_id' => '',
                            'message_text' => $message,
                            'session_number' => $appointment->session_number,
                        ]);
                    }
                    // Record the notificaiton attempt for reporting
                    AppEvent::fire(new ReportingEvent(
                        $appointment->participant->id,
                        '24 hour reminder notification',
                        null,
                        'A',
                        $appointment->session_number,
                        null
                    ));
                } catch (\Exception $e) {
                    // If the endpoint is disabled, delete the device
                    $errorMessage = $e->getMessage();
                    if (substr_count($errorMessage, 'Endpoint is disabled') > 0) {
                        $appointment->participant->user->notifications()->create([
                            'status' => 'disabled',
                            'message_id' => '',
                            'message_text' => $message,
                            'session_number' => $appointment->session_number,
                        ]);
                        Log::error('Device '.$device->id.' disabled. Deleting.');
                        $device->delete();
                    } else {
                        // Log and let the next catch handle this
                        Log::error('Send failed: '.$e->getMessage());
                    }
                }
            }
        }
        // Make sure the appointment reminder is marked as sent
        $appointment->h24_reminder_sent = true;
        $appointment->save();
    }
}
