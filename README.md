Rick Sharp's Code Samples
=========================

These files contain a few samples of recent work. Below is a description of each file:


GetMetricsFromGA.php
--------------------

This file is a Laravel Job that retrieves specific metrics from Google Analyitcs and matches them up with client and budget records stored in the database. It is one job in a process that is broken up into several jobs. The entire process takes about 20 minutes to run in a nightly batch, so it was broken up into multiple jobs so that if any of them fail, the job will autoamatically be restarted, and the process will resume from that point, rather than starting over from the beginning.


InlineTextEditor.vue
--------------------

This is a custom component I created for a project. The component displays plain text in a page, but when that text is clicked, it opens a text editor. The component notates that it can be clicked by changing the cursor and showing a dashed border on hover. This component uses Webpack, so it contains the template, code, and styles in a single file. It is a wrapper for a Vuetify Text Input component.

![Sample Inline Text Editor](images/Inline_Editor_Demo.gif)


Send24HourReminder.php
----------------------
This is a Laravel Console Command that checks for system participants who are ready to receive an appointment reminder based on the current date time and their selected reminder hour. It takes their local time zone into account when calculating the reminder time. Reminders are sent via push notifications in their installed native app. For those who are ready to receive the reminder, it dispatches a job that will handle the actual sending of the push notification.


Send24HourReminderNotification.php
----------------------------------
This is a Laravel Job that sends an appointment reminder push notification using Amazon Simple Notification Service.


simulation-service.js
---------------------
This is a service class used within a VueJS Single Page Application. This service handles storing and retrieving simulation-related data between the SPA and the API.

