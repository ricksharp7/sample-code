<?php

namespace App\Jobs;

use App\Helpers\AnalyticsQuery;
use App\Models\Reports\Budget;
use App\Models\Reports\BudgetMetric;
use App\Models\Reports\Client;
use App\Models\Reports\ClientMetric;
use App\Traits\GetsClientIdsFromGuids;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Log;

/**
 * Retrieves Metrics from Google Analytics, and combines with local data.
 */
class GetMetricsFromGA implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, GetsClientIdsFromGuids;

    /**
     * Create a new job instance.
     */
    public function __construct()
    {
    }

    /**
     * Execute the job.
     */
    public function handle()
    {
        Log::info('Begin Job: GetMetricsFromGA');

        Log::info('Truncating the table.');
        BudgetMetric::query()->truncate();
        ClientMetric::query()->truncate();

        Log::info('Beginning table import.');

        $budgets = [];
        $clients = [];

        // Get the average time on the page
        Log::info('Getting Metric: Average Time On Page');

        // Budget level
        $nextPageToken = null;
        do {
            $query = new AnalyticsQuery();
            $query->setMetric('ga:avgTimeOnPage', 'timeOnPage');
            $query->addDimension('ga:dimension3');
            $results = $query->getResults($nextPageToken);
            $dataRows = $results['rows'];
            $nextPageToken = $results['nextPageToken'];
            Log::info('Processing ' . count($dataRows) . ' results.');
            foreach ($dataRows as $row) {
                if (!isset($budgets[$row['ga:dimension3']]['update_fields']['average_seconds_on_site'])) {
                    $budgets[$row['ga:dimension3']]['update_fields']['average_seconds_on_site'] = 0;
                }
                $budgets[$row['ga:dimension3']]['update_fields']['average_seconds_on_site'] += (int) $row['timeOnPage'];
            }
        } while (null !== $nextPageToken);

        // Client Level
        $nextPageToken = null;
        do {
            $query = new AnalyticsQuery();
            $query->setMetric('ga:avgTimeOnPage', 'timeOnPage');
            $query->addDimension('ga:hostname');
            $query->setFiltersExpression('ga:hostname=~^[^.]+(.v1)?.abalancingact.com$');
            $results = $query->getResults($nextPageToken);
            $dataRows = $results['rows'];
            $nextPageToken = $results['nextPageToken'];
            Log::info('Processing ' . count($dataRows) . ' results.');
            foreach ($dataRows as $row) {
                $hostnameParts = explode('.', $row['ga:hostname']);
                $clientId = $this->getClientIDFromGUID($hostnameParts[0]);
                if (null !== $clientId) {
                    if (!isset($clients[$clientId]['update_fields']['average_seconds_on_site'])) {
                        $clients[$clientId]['update_fields']['average_seconds_on_site'] = 0;
                    }
                    if ($row['timeOnPage'] > $clients[$clientId]['update_fields']['average_seconds_on_site']) {
                        $clients[$clientId]['update_fields']['average_seconds_on_site'] += (int) $row['timeOnPage'];
                    }
                }
            }
        } while (null !== $nextPageToken);

        // Get the visitor ages
        Log::info('Getting Metric: Age');

        // Budget Level
        $nextPageToken = null;
        do {
            $query = new AnalyticsQuery();
            $query->setMetric('ga:users', 'users');
            $query->addDimension('ga:dimension3');
            $query->addDimension('ga:userAgeBracket');
            $results = $query->getResults($nextPageToken);
            $dataRows = $results['rows'];
            $nextPageToken = $results['nextPageToken'];

            foreach ($dataRows as $row) {
                BudgetMetric::create([
                    'budget_id' => $row['ga:dimension3'],
                    'group' => 'age',
                    'label' => $row['ga:userAgeBracket'],
                    'amount' => (int) $row['users'],
                ]);
            }
        } while (null !== $nextPageToken);

        // Client Level
        $nextPageToken = null;
        do {
            $query = new AnalyticsQuery();
            $query->setMetric('ga:users', 'users');
            $query->addDimension('ga:hostname');
            $query->addDimension('ga:userAgeBracket');
            $query->setFiltersExpression('ga:hostname=~^[^.]+(.v1)?.abalancingact.com$');
            $results = $query->getResults($nextPageToken);
            $dataRows = $results['rows'];
            $nextPageToken = $results['nextPageToken'];

            foreach ($dataRows as $row) {
                $hostnameParts = explode('.', $row['ga:hostname']);
                $clientId = $this->getClientIDFromGUID($hostnameParts[0]);
                if (null !== $clientId) {
                    // Could be multiple rows due to v1 subdomains
                    $metric = ClientMetric::firstOrNew([
                        'client_id' => $clientId,
                        'group' => 'age',
                        'label' => $row['ga:userAgeBracket'],
                    ]);
                    $metric->amount += (int) $row['users'];
                    $metric->save();
                    $metric->fresh();
                }
            }
        } while (null != $nextPageToken);

        // Get the visitor cities
        Log::info('Getting Metric: City');

        // Budget Level
        $nextPageToken = null;
        do {
            $query = new AnalyticsQuery();
            $query->setMetric('ga:users', 'users');
            $query->addDimension('ga:dimension3');
            $query->addDimension('ga:city');
            $results = $query->getResults($nextPageToken);
            $dataRows = $results['rows'];
            $nextPageToken = $results['nextPageToken'];

            foreach ($dataRows as $row) {
                BudgetMetric::create([
                    'budget_id' => $row['ga:dimension3'],
                    'group' => 'city',
                    'label' => $row['ga:city'],
                    'amount' => (int) $row['users'],
                ]);
            }
        } while (null !== $nextPageToken);

        // Client Level
        $nextPageToken = null;
        do {
            $query = new AnalyticsQuery();
            $query->setMetric('ga:users', 'users');
            $query->addDimension('ga:hostname');
            $query->addDimension('ga:city');
            $query->setFiltersExpression('ga:hostname=~^[^.]+(.v1)?.abalancingact.com$');
            $results = $query->getResults($nextPageToken);
            $dataRows = $results['rows'];
            $nextPageToken = $results['nextPageToken'];

            foreach ($dataRows as $row) {
                $hostnameParts = explode('.', $row['ga:hostname']);
                $clientId = $this->getClientIDFromGUID($hostnameParts[0]);
                if (null !== $clientId) {
                    // Could be multiple rows due to v1 subdomains
                    $metric = ClientMetric::firstOrNew([
                        'client_id' => $clientId,
                        'group' => 'city',
                        'label' => trim($row['ga:city']),
                    ]);
                    $metric->amount = (int) $metric->amount + (int) $row['users'];
                    $metric->save();
                    $metric->fresh();
                }
            }
        } while (null !== $nextPageToken);

        // Apply values to the budget and client records
        foreach ($budgets as $budgetId => $metrics) {
            Budget::where('id', $budgetId)->update($metrics['update_fields']);
        }

        foreach ($clients as $clientId => $metrics) {
            Client::where('id', $clientId)->update($metrics['update_fields']);
        }

        // Trigger the next job
        dispatch((new GetPageviewsFromGA())->onQueue('import'));

        Log::info('Completed Job: GetMetricsFromGA');
    }
}
