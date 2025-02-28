import "jquery-ui/ui/widgets/datepicker";
import _values from "underscore/modules/values";
import _each from "underscore/modules/each";
import _map from "underscore/modules/map";
import { Graph } from "sumo/js/rickshaw_utils";
import { getQueryParamsAsDict } from "sumo/js/main";

/*
 * kb dashboard chart
 */

(function($) {

  'use strict';

  $(function() {
    if ($('body').is('.locale-metrics')) {
      // Create the dashboard charts.

      makeWikiMetricGraphs();

      makeVoteGraph($('#kpi-vote'), [
        {
          name: gettext('Article Votes: % Helpful'),
          slug: 'wiki_percent',
          func: Graph.fraction('kb_helpful', 'kb_votes'),
          type: 'percent'
        }
      ]);
    }

    if ($('body').is('.aggregated-metrics')) {
      // Create the dashboard charts.
      makeAggregatedWikiMetricGraphs();
    }

    if ($('body').is('.contributor-dashboard')) {
      // Add click events to to the date tabs
      $('.tabs--link').on('click', function() {
        // Clear active class from all tabs--link
        $('.tabs--link').removeClass('is-active');
        // Add is-active class to the clicked tabs--link
        $(this).addClass('is-active');
      });
    }

    if ($('body').is('.localization-dashboard')) {
      // Add's datepicker to the create announcement pop-up
      addDatePicker('#id_show_after');
      addDatePicker('#id_show_until');
    }

    // product selector page reloading
    $('#product-selector select').on('change', function() {
      var val = $(this).val();
      var queryParams = getQueryParamsAsDict(document.location.toString());

      if (val === '') {
        delete queryParams.product;
      } else {
        queryParams.product = val;
      }
      document.location = document.location.pathname + '?' + $.param(queryParams);
    });
  });

  function addDatePicker(inputId) {
    $(inputId).attr('type','text').datepicker('option', 'dateFormat', 'yy-mm-dd');
  }

  function makeVoteGraph($container, descriptors) {
    $.getJSON($container.data('url'), function(data) {
      new Graph($container, {
        data: {
          datums: data.objects,
          seriesSpec: descriptors
        },
        options: {
          legend: false,
          slider: true,
          bucket: true
        },
        graph: {
          width: 600,
          height: 300
        }
      }).render();
    });
  }

  function makeWikiMetricGraphs() {
    // Get the data we need, process it and create the graphs.
    var $l10n = $('#localization-metrics');
    var $contributors = $('#active-contributors');

    $.getJSON($contributors.data('url'), function(data) {
      var results = data.results;
      var resultsByDate;
      var contributorsByDate = {};
      var l10nByDate = {};
      var i, l, result;

      for (i = 0, l = results.length; i < l; i++) {
        // Split out the results into two groups for two separate graphs:
        // * active_contributors
        // * percent_localized_all, percent_localized_top20
        if (results[i].code === 'active_contributors') {
          resultsByDate = contributorsByDate;
        } else {
          resultsByDate = l10nByDate;
        }

        // If we don't have an entry for that date, create it.
        result = resultsByDate[results[i].date] || {date: results[i].date};
        result[results[i].code] = results[i].value;
        resultsByDate[results[i].date] = result;
      }

      // Create the graphs.

      if ($l10n.length) {
        makeWikiMetricGraph(
          $l10n,
          [
            {
              name: gettext('All Articles: % Localized'),
              slug: 'percent_localized_all',
              func: Graph.identity('percent_localized_all')
            },
            {
              name: gettext('Top 20 Articles: % Localized'),
              slug: 'percent_localized_top20',
              func: Graph.identity('percent_localized_top20')
            },
            {
              name: gettext('Top 100 Articles: % Localized'),
              slug: 'percent_localized_top100',
              func: Graph.identity('percent_localized_top100')
            }
          ],
          'mini',
          true,
          _values(l10nByDate)
        );
      }

      makeWikiMetricGraph(
        $contributors,
        [
          {
            name: gettext('Active Contributors'),
            slug: 'active_contributors',
            func: Graph.identity('active_contributors')
          }
        ],
        false,
        false,
        _values(contributorsByDate)
      );

    });

  }

  function makeWikiMetricGraph($container, descriptors, legend, bucket, results) {
    var graph = new Graph($container, {
      data: {
        datums: results,
        seriesSpec: descriptors
      },
      options: {
        legend: legend,
        slider: true,
        bucket: bucket
      },
      graph: {
        width: 600,
        height: 300
      }
    });

    graph.render();

    return graph;
  }

  function makeAggregatedWikiMetricGraphs() {
    // Get the data we need, process it and create the graphs.
    var locales = $('#locale-picker').data('locales');
    var $contributors = $('#active-contributors');
    var graphConfigs = [
      {
        selector: '#percent-localized-top20',
        code: 'percent_localized_top20'
      },
      {
        selector: '#percent-localized-top100',
        code: 'percent_localized_top100'
      },
      {
        selector: '#percent-localized-all',
        code: 'percent_localized_all'
      },
      {
        selector: '#active-contributors',
        code: 'active_contributors'
      }
    ];
    var graphs = [];
    var results = [];
    var count = 0;

    var callback = function(data) {
      count++;
      results = results.concat(data.results);

      if (data.next && count < 60) {
        $.getJSON(data.next, callback);
      } else {
        var resultsByCode = {};
        var resultsByDate;
        var i, l, result, code, date;

        $('.loading-data').remove();
        $('#dashboard-readouts').show();

        for (i = 0, l = results.length; i < l; i++) {
          // Split out the results by code:
          code = results[i].code;
          date = results[i].date;

          // If we don't have an entry for the code, create it.
          resultsByDate = resultsByCode[code] || {};

          // If we don't have an entry for that date, create it.
          result = resultsByDate[date] || {date: date};
          result[results[i].locale] = results[i].value;
          resultsByDate[date] = result;
          resultsByCode[code] = resultsByDate;
        }

        // Create the graphs.
        _each(graphConfigs, function (config) {
          graphs.push(makeWikiMetricGraph(
            $(config.selector),
            _map(locales, function (locale) {
              return {
                name: locale,
                slug: locale,
                func: Graph.identity(locale)
              };
            }),
            false,
            false,
            _values(resultsByCode[config.code])
          ));
        });

        var updateGraphLocales = function() {
          // Update the locale series based on the selected locales.
          var selectedLocales = _map($('#locale-picker :checked'), function (el) {
            return $(el).val();
          });

          // Loop through all the graphs...
          _each(graphs, function (graph) {
            // And all the series (locales) in each graph...
            _each(graph.data.series, function (series, index) {
              if (selectedLocales.indexOf(locales[index]) >= 0) {
                // The locale is selected, show it.
                series.disabled = false;
                graph.data.seriesSpec[index].disabled = false;
              } else {
                // The locale isn't selected, don't show it.
                series.disabled = true;
                graph.data.seriesSpec[index].disabled = true;
              }
            });
            graph.rebucket();
            graph.update();
          });
        };

        // Select the top 10 (exclude #1 which is en-US) locales
        $('#locale-picker :checkbox').slice(1, 11).attr('checked', 'checked');

        // Update the locale series when the selections change.
        $('#locale-picker :checkbox').on('change', updateGraphLocales);

        updateGraphLocales();
      }
    };

    $.getJSON($contributors.data('url'), callback);
  }

})(jQuery);
