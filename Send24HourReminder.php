<?php

namespace App\Console\Commands;

use App\Jobs\Send24HourReminderNotification;
use App\Models\V1\Appointment;
use Illuminate\Console\Command;

class Send24HourReminder extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'send:24hour';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sends the 24-hour reminder push notifications for scheduled appointments.';

    /**
     * Create a new command instance.
     */
    public function __construct()
    {
        parent::__construct();
    }

    /**
     * Execute the console command.
     *
     * @return mixed
     */
    public function handle()
    {
        $verbose = $this->option('verbose');

        // Get all appointments in the future that have not yet had a 24-hour reminder sent
        $appointments = Appointment::with(
            'participant',
            'participant.user',
            'participant.user.devices',
            'location',
            'participant.child'
        )
            ->withinHours(48)
            ->reminderNotSent()
            ->status('scheduled')
            ->get();

        if ($appointments->count() < 1) {
            // Nothing to send
            if ($verbose) {
                $this->info('No reminders to send.');
            }

            return true;
        }

        foreach ($appointments as $appointment) {
            if ($verbose) {
                $this->info('Processing appointment ID '.$appointment->id);
            }
            // Make sure this participant is ready to receive a notification
            if (($appointment->participant->user->status === 'active') && ($appointment->participant->user->devices->count() > 0)) {
                // Check to see what time the reminder should be sent.
                if ($appointment->location) {
                    $timezone = new \DateTimeZone($appointment->location->timezone);
                } else {
                    $timezone = new \DateTimeZone('America/New_York');
                }
                $reminderTime = $appointment->getLocal24HourPreSessionReminderTime();
                if ($verbose) {
                    $this->info('Reminder time '.$reminderTime->format('Y-m-d H:i:s e'));
                }

                $localTime = new \DateTime();
                $localTime->setTimeZone($timezone);

                $difference = $reminderTime->diff($localTime);
                if ($verbose) {
                    $this->info('Current local time '.$localTime->format('Y-m-d H:i:s e'));
                }

                if ($localTime >= $reminderTime) {
                    if ($verbose) {
                        $this->info('Creating 24-hour reminder job.');
                    }
                    dispatch(new Send24HourReminderNotification($appointment));
                } else {
                    if ($verbose) {
                        $this->info('Skipping, not time yet.');
                    }
                }
            } else {
                if ($verbose) {
                    $this->info('Skipping, participant is not activated or has no devices.');
                }
            }
        }
    }
}
