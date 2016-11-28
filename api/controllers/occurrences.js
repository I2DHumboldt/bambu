import elasticsearch from 'elasticsearch';
import Geohash from 'latlon-geohash';
import geojsonVt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import { config } from '../../config/application-config';

// const debug = require('debug')('dataportal-api:occurrences');

const client = new elasticsearch.Client({
  hosts: config.get('database.elasticSearch.url'),
  log: 'trace'
});

const queryMap = {
  exactQuery:{group:'resource.group'},
  wildcardQuery:{
    scientificName: 'canonical',
    kingdomName: 'taxonomy.kingdom_name',
    phylumName: 'taxonomy.phylum_name',
    className: 'taxonomy.class_name',
    orderName: 'taxonomy.order_name',
    familyName: 'taxonomy.family_name',
    genusName: 'taxonomy.genus_name',
    speciesName: 'taxonomy.species_name',
    specificEpithetName: 'taxonomy.specific_epithet',
    infraspecificEpithetName: 'taxonomy.infraspecific_epithet',
    providerName: 'provider.name',
    resourceName: 'resource.name',
    collectionName: 'collection.name',
    institutionCode: 'institution.code',
    countryName: 'country_name',
    departmentName: 'department_name',
    countyName: 'county_name',
    habitat: 'habitat',
    basisOfRecord: 'basis_of_record.name'
  }
};

function addQueriesFromMap(params, query, queryMap){
  for(let key in queryMap.exactQuery) {
    addExactQuery(params[key].value, queryMap.exactQuery[key], query);
  }
  for(let key in queryMap.wildcardQuery) {
    addWildcardQuery(params[key].value, queryMap.wildcardQuery[key]+".exactWords", query);
  }
}

function addWildcardQuery(paramValue, field, query) {
  if (paramValue) {
    let anotherMust = {
      bool: {
        should: []
      }
    };
    if(Array.isArray(group)){
      paramValue.forEach((value) => {
        let wildcardQuery = {};
        wildcardQuery[field] = `*${value.toLowerCase()}*`;
        anotherMust.bool.should.push({
          wildcard: wildcardQuery
        });
      });
    }
    else {
      let wildcardQuery = {};
      wildcardQuery[field] = `${paramValue.toLowerCase()}`;
      anotherMust.bool.should.push({
        wildcard: wildcardQuery
      });
    }
    query.query.bool.must.push(anotherMust);
  }
}

function addExactQuery(paramValue, field, query) {
  if (paramValue) {
    let anotherMust = {
      bool: {
        should: [],
      }
    };

    if(Array.isArray(paramValue)){
      paramValue.forEach((value) => {
        let tempQuery = {};
        tempQuery[field] = `${value.toLowerCase()}`;
        anotherMust.bool.should.push({
          term: tempQuery
        });
      });
    }
    else {
      let tempQuery = {};
      tempQuery[field] = `${paramValue.toLowerCase()}`;
      anotherMust.bool.should.push({
        term: tempQuery
      });
    }
    query.query.bool.must.push(anotherMust);
  }
}

function addGeoQuery(params, query) {
  if (params.latitudeTopLeft.value && params.longitudeTopLeft.value && params.latitudeBottomRight.value && params.longitudeBottomRight.value) {
    query.query.bool.filter = {
      geo_bounding_box: {
        location: {
          top_left: {
            lat: params.latitudeTopLeft.value,
            lon: params.longitudeTopLeft.value
          },
          bottom_right: {
            lat: params.latitudeBottomRight.value,
            lon: params.longitudeBottomRight.value
          }
        }
      }
    };
  }
}

function addElevationQuery(params, query) {
  // Query related with elevation
  if (params.elevationEqual.value || params.elevationGreaterOrEqualTo.value || params.elevationLessOrEqualTo.value) {
    let anotherMust = {
      bool: {
        should: [],
      }
    };

    if (params.elevationEqual.value) {
      params.elevationEqual.value.forEach((value) => {
        anotherMust.bool.should.push({
          constant_score: {
            filter: {
              term: {
                minimum_elevation: parseFloat(value)
              }
            }
          }
        });
      });
    }
    if (params.elevationGreaterOrEqualTo.value) {
      params.elevationGreaterOrEqualTo.value.forEach((value) => {
        anotherMust.bool.should.push({
          constant_score: {
            filter: {
              range: {
                minimum_elevation: {
                  gte: parseFloat(value)
                }
              }
            }
          }
        });
      });
    }
    if (params.elevationLessOrEqualTo.value) {
      params.elevationLessOrEqualTo.value.forEach((value) => {
        anotherMust.bool.should.push({
          constant_score: {
            filter: {
              range: {
                minimum_elevation: {
                  lte: parseFloat(value)
                }
              }
            }
          }
        });
      });
    }
    query.query.bool.must.push(anotherMust);
  }
}

function addDepthQuery(params, query) {
  if (params.depthEqual.value || params.depthGreaterOrEqualTo.value || params.depthLessOrEqualTo.value) {

    let anotherMust = {
      bool: {
        should: [],
      }
    };

    if (params.depthEqual.value) {
      params.depthEqual.value.forEach((value) => {
        anotherMust.bool.should.push({
          constant_score: {
            filter: {
              term: {
                minimum_elevation: -parseFloat(value)
              }
            }
          }
        });
      });
    }
    if (params.depthGreaterOrEqualTo.value) {
      params.depthGreaterOrEqualTo.value.forEach((value) => {
        anotherMust.bool.should.push({
          constant_score: {
            filter: {
              range: {
                minimum_elevation: {
                  lte: -parseFloat(value)
                }
              }
            }
          }
        });
      });
    }
    if (params.depthLessOrEqualTo.value) {
      params.depthLessOrEqualTo.value.forEach((value) => {
        anotherMust.bool.should.push({
          constant_score: {
            filter: {
              range: {
                minimum_elevation: {
                  gte: -parseFloat(value)
                }
              }
            }
          }
        });
      });
    }
    query.query.bool.must.push(anotherMust);
  }
}

const colorPalette = ['#FFFFFF', '#FFE8A5', '#FDDC9E', '#FBD198', '#F9C592', '#F7BA8B', '#F5AF85', '#F3A37F', '#F19879',
  '#EF8D72', '#ED816C', '#EB7666', '#EA6B60', "#000000"];

/*
  Returns count of occurrences according to query parameters
  Param 1: isGeoreferenced (boolean), if true returns the count of georeferenced occurrences
 */
function occurrenceCount(req, res) {
  const isGeoreferenced = {
    bool: {
      must: {
        exists: {
          field: 'location'
        }
      }
    }
  };

  const isNotGeoreferenced = {
    bool: {
      must_not: {
        exists: {
          field: 'location'
        }
      }
    }
  };

  const query = {
    query: {
      bool: {
        should: [isGeoreferenced],
        must: [
          {
            query_string: {
              query: '*'
            }
          }
        ]
      }
    }
  };

  const onlyGeoreferenced = req.swagger.params.isGeoreferenced.value || false;

  if (!onlyGeoreferenced) {
    query.query.bool.should.push(isNotGeoreferenced);
  }

  //Add group query part
  //addExactQuery(req.swagger.params.group.value, 'resource.group', query);
  for(let key in queryMap.exactQuery) {
    addExactQuery(req.swagger.params[key].value, queryMap.exactQuery[key], query);
  }

  client.count({
    index: config.get('database.elasticSearch.index'),
    type: 'occurrence',
    body: query
  }, (err, response) => {
    // this sends back a JSON response which is a single string
    res.setHeader('Content-Type', 'application/json');
    res.json({
      count: response.count
    });
  });
}

/*
  Returns occurrences and facets data according to params request

  Param facet: type string, name of element used for aggregation
 */
function search(req, res) {
  const from = ((req.swagger.params.page.value) ? req.swagger.params.page.value : 0)
    * ((req.swagger.params.size.value) ? req.swagger.params.size.value : 10);
  // Root query for ES
  const query = {
    from,
    size: (req.swagger.params.size.value) ? req.swagger.params.size.value : 10,
    query: {
      bool: {
        must: [
          {
            query_string: {
              query: '*'
            }
          }
        ]
      }
    },
    aggs: {}
  };

  // Check parameters for bounding box query
  addGeoQuery(req.swagger.params, query);

  // If query general condition
  if (req.swagger.params.q.value) {
    query.query.bool.must[0].query_string.query = req.swagger.params.q.value;
  }
  // If wildcard queries and exact queries
  addQueriesFromMap(req.swagger.params, query, queryMap);
  // Query related with elevation
  addElevationQuery(req.swagger.params, query);
  // Query related with depth
  addDepthQuery(req.swagger.params, query);

  // If facets query param construct the query for ES
  if (req.swagger.params.facet.value) {
    req.swagger.params.facet.value.forEach((value) => {

      if(queryMap.wildcardQuery[value]) {
        query.aggs[value] = {
          terms: {
            field: queryMap.wildcardQuery[value]+'.untouched',
            size: (req.swagger.params.facetLimit.value) ? req.swagger.params.facetLimit.value : 10,
            shard_size: 100000
          }
        };
        if (value === 'county') {
          query.aggs[value].aggs = {
            department: {
              terms: {
                field: 'department_name.untouched',
                  size: 10,
                  shard_size: 100000
              }
            }
          }
        }
      }
    });
    query.size = 0;
  }

  client.search({
    index: config.get('database.elasticSearch.index'),
    type: 'occurrence',
    body: query
  }, (err, response) => {
    if (err) {
      res.status(400).json({
        message: 'Error searching occurrence data.',
        description: err.message
      });
    } else {
      // Create facets and results array
      const facets = [];
      const results = [];

      // Fill if aggregations exits
      if (response.aggregations) {
        Object.keys(response.aggregations).forEach((key) => {
          facets.push({
            field: key,
            counts: response.aggregations[key].buckets
          });
        });
      }

      // Fill if results exits
      if (response.hits.hits) {
        response.hits.hits.forEach((occurrence) => {
          results.push(occurrence._source);
        });
      }

      // this sends back a JSON response
      res.setHeader('Content-Type', 'application/json');
      res.json({
        offset: (req.swagger.params.page.value) ? req.swagger.params.page.value : 0,
        size: (req.swagger.params.size.value) ? req.swagger.params.size.value : 10,
        count: response.hits.total,
        facets,
        results
      });
    }
  });
}

/*
  Returns a grid with occurrence densities according to params request
 */
function gridSearch(req, res) {
  // Root query for ES
  const query = {
    size: 0,
    query: {
      bool: {
        must: [
          {
            query_string: {
              query: '*'
            }
          }
        ]
      }
    },
    aggs: {
      occurrence_GeoHashGrid: {
        geohash_grid: {
          field: 'location',
          precision: req.swagger.params.precision.value || 5,
          size: 1000000
        }
      }
    }
  };

  // If query general condition
  if (req.swagger.params.q.value) {
    query.query.bool.must[0].query_string.query = req.swagger.params.q.value;
  }
  // If wildcard queries and exact queries
  addQueriesFromMap(req.swagger.params, query, queryMap);
  // Query related with elevation
  addElevationQuery(req.swagger.params, query);
  // Query related with depth
  addDepthQuery(req.swagger.params, query);

  client.search({
    index: config.get('database.elasticSearch.index'),
    type: 'occurrence',
    body: query
  }, (err, response) => {
    if (err) {
      res.status(400).json({
        message: 'Error searching occurrence data.',
        description: err.message
      });
    } else {
      // Create results array

      const features = [];
      let higher = 1;
      let lower = 0;
      let logValueHigher = 1;
      let fillColor = req.swagger.params.color.value;
      const swgPrms = req.swagger.params;

      // Fill features data
      if (response.aggregations.occurrence_GeoHashGrid.buckets.length !== 0) {
        const occurrenceGeoHashGrid = response.aggregations.occurrence_GeoHashGrid;
        if (req.swagger.params.scale.value === 'linear') {
          higher = occurrenceGeoHashGrid.buckets[0].doc_count;
          lower = occurrenceGeoHashGrid.buckets[occurrenceGeoHashGrid.buckets.length - 1].doc_count;
        } else if (req.swagger.params.scale.value === 'logarithmic') {
          higher = occurrenceGeoHashGrid.buckets[0].doc_count;
          logValueHigher = Math.log10(higher);
        }

        Object.keys(occurrenceGeoHashGrid.buckets).forEach((key) => {
          const bounds = Geohash.bounds(occurrenceGeoHashGrid.buckets[key].key);

          let alpha = 0;
          if (req.swagger.params.scale.value === 'linear') {
            let p = (occurrenceGeoHashGrid.buckets[key].doc_count - lower) / (higher - lower);
            p = Math.min(p, 1);
            p = Math.max(p, 0);
            p = Math.pow(p, 0.5);
            alpha = 0.2 + (p * 0.60);
          } else if (req.swagger.params.scale.value === 'logarithmic') {
            let p = occurrenceGeoHashGrid.buckets[key].doc_count;
            p = Math.max(p, 21);
            p = Math.log10(p);
            alpha = (p * 0.8) / logValueHigher;
          }

          if (swgPrms.colorMethod.value === 'gradient' && swgPrms.scale.value === 'logarithmic') {
            alpha = 0.8;
            let p = occurrenceGeoHashGrid.buckets[key].doc_count;
            p = Math.max(p, 2);
            p = Math.log10(p);
            fillColor = colorPalette[Math.ceil((p * 12) / logValueHigher)];
          }

          features.push({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [bounds.sw.lon, bounds.sw.lat],
                  [bounds.sw.lon, bounds.ne.lat],
                  [bounds.ne.lon, bounds.ne.lat],
                  [bounds.ne.lon, bounds.sw.lat],
                  [bounds.sw.lon, bounds.sw.lat]
                ]
              ]
            },
            properties: {
              stroke: '#555555',
              'stroke-width': 0,
              'stroke-opacity': 0,
              fill: fillColor,
              'fill-opacity': alpha,
              count: response.aggregations.occurrence_GeoHashGrid.buckets[key].doc_count,
              hash: response.aggregations.occurrence_GeoHashGrid.buckets[key].key
            }
          });
        });
      }

      // this sends back a JSON response
      res.setHeader('Content-Type', 'application/json');
      res.json({
        type: 'FeatureCollection',
        features
      });
    }
  });
}

/*
  Returns a grid with occurrence densities according to params request using
  vector tile format using protocol buffer
 */
function gridSearchPbf(req, res) {
  // Root query for ES
  const query = {
    size: 0,
    query: {
      bool: {
        must: [
          {
            query_string: {
              query: '*'
            }
          }
        ]
      }
    },
    aggs: {
      occurrence_GeoHashGrid: {
        geohash_grid: {
          field: 'location',
          precision: req.swagger.params.precision.value || 5,
          size: 1000000
        }
      }
    }
  };

  // If query general condition
  if (req.swagger.params.q.value) {
    query.query.bool.must[0].query_string.query = req.swagger.params.q.value;
  }
  // If wildcard queries and exact queries
  addQueriesFromMap(req.swagger.params, query, queryMap);
  // Query related with elevation
  addElevationQuery(req.swagger.params, query);
  // Query related with depth
  addDepthQuery(req.swagger.params, query);

  client.search({
    index: config.get('database.elasticSearch.index'),
    type: 'occurrence',
    body: query
  }, (err, response) => {
    if (err) {
      res.status(400).json({
        message: 'Error searching occurrence data.',
        description: err.message
      });
    } else {
      // Create results array

      const features = [];
      let higher = 1;
      let lower = 0;
      let logValueHigher = 1;
      let fillColor = req.swagger.params.color.value;
      const swgPrms = req.swagger.params;

      // Fill features data
      if (response.aggregations.occurrence_GeoHashGrid.buckets.length !== 0) {
        const occurrenceGeoHashGrid = response.aggregations.occurrence_GeoHashGrid;
        if (req.swagger.params.scale.value === 'linear') {
          higher = occurrenceGeoHashGrid.buckets[0].doc_count;
          lower = occurrenceGeoHashGrid.buckets[occurrenceGeoHashGrid.buckets.length - 1].doc_count;
        } else if (req.swagger.params.scale.value === 'logarithmic') {
          higher = occurrenceGeoHashGrid.buckets[0].doc_count;
          logValueHigher = Math.log10(higher);
        }

        Object.keys(occurrenceGeoHashGrid.buckets).forEach((key) => {
          const bounds = Geohash.bounds(occurrenceGeoHashGrid.buckets[key].key);

          let alpha = 0;
          if (req.swagger.params.scale.value === 'linear') {
            let p = (occurrenceGeoHashGrid.buckets[key].doc_count - lower) / (higher - lower);
            p = Math.min(p, 1);
            p = Math.max(p, 0);
            p = Math.pow(p, 0.5);
            alpha = 0.2 + (p * 0.60);
          } else if (req.swagger.params.scale.value === 'logarithmic') {
            let p = occurrenceGeoHashGrid.buckets[key].doc_count;
            p = Math.max(p, 21);
            p = Math.log10(p);
            alpha = (p * 0.8) / logValueHigher;
          }

          if (swgPrms.colorMethod.value === 'gradient' && swgPrms.scale.value === 'logarithmic') {
            alpha = 0.8;
            let p = occurrenceGeoHashGrid.buckets[key].doc_count;
            p = Math.max(p, 2);
            p = Math.log10(p);
            fillColor = colorPalette[Math.ceil((p * 12) / logValueHigher)];
          }

          features.push({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [bounds.sw.lon, bounds.sw.lat],
                  [bounds.sw.lon, bounds.ne.lat],
                  [bounds.ne.lon, bounds.ne.lat],
                  [bounds.ne.lon, bounds.sw.lat],
                  [bounds.sw.lon, bounds.sw.lat]
                ]
              ]
            },
            properties: {
              stroke: '#555555',
              'stroke-width': 0,
              'stroke-opacity': 0,
              fill: fillColor,
              'fill-opacity': alpha,
              count: response.aggregations.occurrence_GeoHashGrid.buckets[key].doc_count,
              hash: response.aggregations.occurrence_GeoHashGrid.buckets[key].key
            }
          });
        });
      }

      const tileIndex = geojsonVt({
        type: 'FeatureCollection',
        features
      });

      const tile = tileIndex.getTile(swgPrms.z.value, swgPrms.x.value, swgPrms.y.value);

      // pass in an object mapping layername -> tile object
      try {
        const buff = vtpbf.fromGeojsonVt({ geojsonLayer: tile });

        // this sends back a JSON response
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(buff, 'binary');
      } catch (error) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(null, 'binary');
        /* res.status(400).json({
          message: 'Error searching occurrence data.',
          description: error.message
        });*/
      }
    }
  });
}

module.exports = {
  occurrenceCount,
  search,
  gridSearch,
  gridSearchPbf
};
