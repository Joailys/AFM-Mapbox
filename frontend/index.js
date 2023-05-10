/*

   ***********************************************************
   Airlift - MapBox + Vega-Lite
   Copyright (c) 2020 by Global Technologies Corporation
   ALL RIGHTS RESERVED
   ***********************************************************

*/

// react library
import React, {
    useState,
    useEffect
} from 'react';

// import ReactDOM from 'react-dom';
import VegaLite from 'react-vega-lite';

// airtable model libraries
import {
    cursor,
    globalConfig,
    settingsButton
} from '@airtable/blocks';

// airtable ui libraries
import {
    initializeBlock,
    useBase,
    useRecords,
    useLoadable,
    useWatchable,
    expandRecord,
    useSettingsButton
} from '@airtable/blocks/ui';

// mapbox libraries
import mapboxgl from 'mapbox-gl';

// other libraries
import { bbox } from 'turf';

//
// set the map base
//
const mapGLStyle = "mapbox://styles/mapbox/dark-v9";
// const mapGLStyle = "mapbox://styles/mapbox/satellite-v9";

//
// set the mapbox token
//
mapboxgl.accessToken = 'pk.eyJ1IjoicHliYW5hc3pha3RoZWZpZWxkIiwiYSI6ImNsOXg4ZGM5YjA4aHczc3BrMnljb242dHkifQ.6lqBaPacbMoOqOcSmj3PTw';

//
// create the vega-lite spec
//
const spec = {
    "name" : "vegaChart",
    "title": {
        "text" : "Death Rates",
        "color": "#00ff00"
    },
    "description": "State or County Death Rates",
    "width": 120,
    "height": 320,
    "mark": {
        "type": "bar",
        "color": "#00ff00",
        "opacity" : .3
    },
    "background"  : "transparent",
    "view": {
        "stroke": "transparent",
        "fill"    : "transparent"
    },
    "encoding": {
        "x"       : {
            "field" : "b",
            "type": "quantitative",
            "axis": {
                "grid" : false,
                "labelColor": "#00ff00"
            },
        },
        "y"       : {
            "field": "a",
            "type": "ordinal",
            "axis": {
                "labelColor": "#00ff00"
            },
            "sort": "-x"
        }
    }
};

const opts = {
    // "actions": false
    "export" : false,
    "source" : true
}

//
// establish the static vars
//

let cAppTitle          = "US Covid-19 Deaths";
let thisBase;
let oLocations         = {};
let oPolygonsStatic    = {};
let oPolygonsSelected  = {};

let oStateDeathRates   = {};
let aStateData         = [];

let oCountyDeathRates  = {};
let aCountyData        = [];
let cMaxCounties       = 24;

let cMapCentroid       = [-98.0, 39.0];
let cMapZoom           = 3;
let cScrollZoom        = true;

let aSelectedRecords   = [];

// establish a global map object
let map;

//
// main react component
//
function AirliftMapbox() {

    React.useEffect(() => {
        loadMap();
    }, []);

    // get the base
    thisBase           = useBase();
    const thisBaseName = thisBase.name;

    // get the current view of the map app
    let thisQuery      = cAppTitle + " :: (raw numbers)";

    //
    // states table
    //
    // get the states table
    const statesTable    = thisBase.getTableByNameIfExists('States');
    // get the states view
    const statesView     = statesTable.getViewByNameIfExists('Locations');

    //
    // counties table
    //
    // get the counties table
    const countiesTable  = thisBase.getTableByNameIfExists('Counties');
    // get the states view
    const countiesView   = countiesTable.getViewByNameIfExists('Locations');

    // watch the selections in airtable
    useLoadable(cursor);
    useWatchable(cursor, ['selectedRecordIds', 'selectedFieldIds']);

    // update the sites data
    updateData(statesTable, statesView, countiesTable, countiesView, cursor);

    const headerStyle = {
        height:          '32px',
        color:           'black',
        fontWeight:      'bold',
        paddingTop:      '6px',
        textAlign:       'center',
        fontSize:        '140%',
        background:      '#efefef'
    };

    const mapStyle = {
        position:       'absolute',
        top:            '0',
        bottom:         '0',
        width:          '100%'
    };

    const stateChartStyle = {
        position:        'absolute',
        top:             10,
        left:            0,
        backgroundColor: "transparent",
        display:         "none"
    };

    const countyChartStyle = {
        position:        'absolute',
        top:             10,
        left:            0,
        backgroundColor: "transparent",
        display:         "block"
    };

    // create objects to handle clicke events on states directly (managed through the header id)
    const [count, setCount] = useState(0);

    useEffect(() => {

        // Update the document title using the browser API
        // document.message = `You clicked ${count} times`;
        // console.log('COUNT: ' + count);

    });

    /*
        some ui experiments
        <div id='message'>
            You clicked {count} times
        </div>
        <div id='recordID'></div>
    */

    return (
        <div>
            <div id='appHeader' style={headerStyle} onClick={() => setCount(count + 1)}>{thisQuery}</div>
            <div id='map' style={mapStyle}>
                <div id='countyChart' style={countyChartStyle}>
                    <VegaLite spec={spec} data={oCountyDeathRates} opt={opts}/>
                </div>
            </div>
            <link href="https://api.mapbox.com/mapbox-gl-js/v1.6.1/mapbox-gl.css" rel="stylesheet" />
        </div>
    )

}

//
// update map data
//
function updateData(statesTable, statesView, countiesTable, countiesView, cursor)
{

    // console.log('updateData() FIRED!');

    // get the current list of selected records
    let aCurrentSelectedRecords = (aSelectedRecords.length > 0) ? aSelectedRecords : cursor.selectedRecordIds;

    // establish the data fields to be loaded
    const statesOpts = {
        fields: [
            'Name',
            "ST",
            "Total Cases",
            "Total Deaths",
            "Lat",
            "Lng",
            "Polygon"
        ],
    };

    // get the states records
    const statesRecords = useRecords(statesView, statesOpts);

    // aggregate the data
    let totalUSADeaths = 0;
    for (var i in statesRecords)
    {
        totalUSADeaths += statesRecords[i].getCellValue("Total Deaths");
    }

    // establish the data fields to be loaded
    const countiesOpts = {
        fields: [
            'County',
            "State",
            "Confirmed",
            "Total Deaths",
            "Incident Rate",
            "Lat",
            "Lng",
            "Polygon"
        ],
    };

    // get the counties records
    const countiesRecords = useRecords(countiesView, countiesOpts);

    // enumerate the records
    let aPoints               = [];
    let aPointsSelected       = [];
    let aPolygonsSelected     = [];
    let aPolygonsStatic       = [];
    let aCountyConnectorLines = [];
    let aCountyHeatmap        = [];
    let aThisSelection        = [];

    let aAllDeathRates        = [];
    let aStateDeathRates      = [];
    let aCountyDeathRates     = [];

    for (var i in statesRecords)
    {

        // get the record id of the site
        let thisRecordID = statesRecords[i].id;

        // get the name of the state
        let thisName = statesRecords[i].getCellValue("Name");

        // get the lat/lng
        let thisLat  = statesRecords[i].getCellValue("Lat");
        let thisLng  = statesRecords[i].getCellValue("Lng");
        // console.log(thisName + ": " + thisLat + " :: " + thisLng);

        let thisStatesDeaths = statesRecords[i].getCellValue("Total Deaths");
        let thisStatesPercentDeaths = ((thisStatesDeaths / totalUSADeaths) * 100).toFixed(1);
        let thisClassID = parseInt(thisStatesPercentDeaths) + 2;

        // remedy for large polygons
        let thisPolygonGeometry  = JSON.parse(statesRecords[i].getCellValue("Polygon"));

        if ((thisName) && (thisLat) && (thisLng))
        {

            // create the location point
            let thisPoint =
            {
                "type"     : "Feature",
                "geometry" : {
                    "type" : "Point",
                    "coordinates" : [
                        parseFloat(thisLng),
                        parseFloat(thisLat)
                    ]
                },
                properties : {
                    "name"          : thisName,
                    "deaths"        : thisStatesDeaths,
                    "percentDeaths" : thisStatesPercentDeaths
                }
            }
            aPoints.push(thisPoint);

            // create the static (unselected) polygon
            if (thisPolygonGeometry)
            {
                let thisStaticPolygon =
                {
                    "type"     : "Feature",
                    "geometry" : {},
                    properties : {
                        "recordID"      : thisRecordID,
                        "name"          : thisName,
                        "deaths"        : thisStatesDeaths,
                        "percentDeaths" : thisStatesPercentDeaths,
                        "class_id"      : thisClassID
                    }
                }
                thisStaticPolygon.geometry = thisPolygonGeometry;
                aPolygonsStatic.push(thisStaticPolygon);
            }

            // add to the vega chart data list of states
            if (aAllDeathRates.length <= cMaxCounties)
            aAllDeathRates.push({
                "a" : statesRecords[i].getCellValue("Name"),
                "b" : statesRecords[i].getCellValue("Total Deaths")
            });
            // console.log(aAllDeathRates);


            //
            // create the selected points/areas
            //

            if (aCurrentSelectedRecords.indexOf(statesRecords[i].id) > -1)
            {

                // build the selected points for fly-to
                aThisSelection.push([thisLng, thisLat, thisPolygonGeometry]);

                // create the selected site point
                let thisSelectedPoint =
                {
                    "type"     : "Feature",
                    "geometry" : {
                        "type" : "Point",
                        "coordinates" : [
                            parseFloat(thisLng),
                            parseFloat(thisLat)
                        ]
                    },
                    properties : {
                        "name"          : thisName,
                        "deaths"        : thisStatesDeaths,
                        "percentDeaths" : thisStatesPercentDeaths
                    }
                }
                aPointsSelected.push(thisSelectedPoint);

                // create the selected polygon
                if (thisPolygonGeometry)
                {
                    let thisSelectedPolygon =
                    {
                        "type"     : "Feature",
                        "geometry" : {},
                        properties : {
                            "name"          : thisName,
                            "deaths"        : thisStatesDeaths,
                            "percentDeaths" : thisStatesPercentDeaths,
                            "class_id"      : thisClassID
                        }
                    }
                    thisSelectedPolygon.geometry = thisPolygonGeometry;
                    // console.log(JSON.stringify(thisSelectedArea));
                    aPolygonsSelected.push(thisSelectedPolygon);
                }

                // add to the vega chart data list of states
                if (aStateDeathRates.length <= cMaxCounties)
                aStateDeathRates.push({
                    "a" : statesRecords[i].getCellValue("Name"),
                    "b" : statesRecords[i].getCellValue("Total Deaths")
                });
                // console.log(aStateDeathRates);

                //
                // process the counties associated with this state
                //
                aCountyData = [];
                for (var i in countiesRecords)
                {

                    if ((countiesRecords[i].getCellValue("Lat")) && (countiesRecords[i].getCellValue("Lng")))
                    {

                        // if (aCountyData.length == 0)
                        // {
                            aCountyData.push([countiesRecords[i].getCellValue("State"), countiesRecords[i].getCellValue("County"), countiesRecords[i].getCellValue("Total Deaths")]);
                        // }

                        // get the record id of the site
                        let thisRecordID = countiesRecords[i].id;

                        // get the name of the county
                        let thisCountyName = countiesRecords[i].getCellValue("County");

                        // get the name of the state
                        let thisCountiesState = countiesRecords[i].getCellValue("State");

                        // add a connector and a heatmap feature
                        if (thisName === thisCountiesState)
                        {

                            // console.log(thisName + ": " +countiesRecords[i].getCellValue("County"));

                            let thisCountysDeaths = countiesRecords[i].getCellValue("Total Deaths");
                            let thisCountysPercentDeaths = (thisCountysDeaths / thisStatesDeaths) * 100;
                            let thisCountysClassID = parseInt(thisCountysPercentDeaths) + 2;
                            // console.log("ClassID: " + thisCountysClassID);

                            // get the lat/lng of the county
                            let thisCountyLat  = countiesRecords[i].getCellValue("Lat");
                            let thisCountyLng  = countiesRecords[i].getCellValue("Lng");

                            // draw the line object
                            let thisConnectorLine =
                            {
                                "type"     : "Feature",
                                properties : {
                                    "class_id": thisCountysClassID
                                },
                                "geometry" : {
                                    'type': 'LineString',
                                    'coordinates': [
                                        [thisLng, thisLat],
                                        [thisCountyLng, thisCountyLat]
                                    ]
                                }
                            }
                            aCountyConnectorLines.push(thisConnectorLine);

                            // draw the heatmap object
                            let thisHeatmapItem =
                            {
                                "type"     : "Feature",
                                "geometry" : {
                                    "type" : "Point",
                                    "coordinates" : [
                                        parseFloat(thisCountyLng),
                                        parseFloat(thisCountyLat)
                                    ]
                                },
                                properties : {
                                    "name" : thisCountyName,
                                    "mag"  : thisCountysClassID + 2
                                }
                            }
                            aCountyHeatmap.push(thisHeatmapItem);

                            // add to the vega chart data list of counties
                            if (aCountyDeathRates.length <= cMaxCounties)
                                aCountyDeathRates.push({
                                    "a" : countiesRecords[i].getCellValue("County"),
                                    "b" : countiesRecords[i].getCellValue("Total Deaths")
                                });

                        }
                    }
                    // console.log(aCountyConnectorLines);
                }

            }

        }

    }

    //
    // update the static features objects
    //
    oLocations = {
        "type" : "FeatureCollection",
        "features" : aPoints
    };
    oPolygonsStatic = {
        "type" : "FeatureCollection",
        "features" : aPolygonsStatic
    };
    oPolygonsSelected = {
        "type" : "FeatureCollection",
        "features" : aPolygonsSelected
    };

    if ((aStateDeathRates.length == 0) && (aCountyDeathRates.length == 0))
    {
        oCountyDeathRates = {
            "values": aAllDeathRates
        }
    } else if (aStateDeathRates.length > 1) {
        oCountyDeathRates = {
            "values": aStateDeathRates
        }
    } else {
        oCountyDeathRates = {
            "values": aCountyDeathRates
        }
    }

    //
    // is the map actually loaded?
    //
    if (map)
    {

        //
        // update the sources
        //
        map.getSource('staticPolygonsSource').setData(oPolygonsStatic);
        map.getSource('selectedPolygonsSource').setData(oPolygonsSelected);

        //
        // fly to selection
        //
        if (aCurrentSelectedRecords.length == 0) {
            // do nothing...
            document.getElementById("appHeader").innerHTML + cAppTitle + " :: Raw Data";
            flyToSelection(averageGeolocation([cMapCentroid]));
        } else if (aCurrentSelectedRecords.length == 1) {
            // fly to the selected site
            document.getElementById("appHeader").innerHTML = cAppTitle + " :: " + oPolygonsSelected.features[0].properties.name;
            flyToSelection(averageGeolocation(aThisSelection), oPolygonsSelected.features[0].properties.name);
        } else {
            // fly to the centroid of the selected sites
            document.getElementById("appHeader").innerHTML = cAppTitle + " :: United States";
            flyToSelection(averageGeolocation(aThisSelection))
        }

    }

    return(true);

}

//
// load the mapbox map
//
function loadMap()
{

    console.log('Map is loading!');

    map = new mapboxgl.Map({
        container:  'map',
        style:      mapGLStyle,
        center:     cMapCentroid,
        zoom:       cMapZoom,
        scrollZoom: cScrollZoom
    });

    //
    // add the newly selected source
    //
    map.on('load', function () {

        console.log('MAP WAS LOADED!');

        map.addControl(new mapboxgl.NavigationControl());

        //
        // add the locations layer and source
        //
        /*
        map.addSource("locationsSource", {
            "type"   : "geojson",
            "data"   : oLocations
        });
        map.addLayer({
            "id"     : "locationsLayer",
            "type"   : "circle",
            "source" : "locationsSource",
            'paint'  : {
                "circle-radius" :
                {
                    stops: [
                        [0, 20],
                        [20, 20]
                      ],
                      base: 2                    },
                "circle-color"   : '#FF00FF',
                'circle-opacity' : .2
            }
        });
        */

        //
        // add the static areas layer and source
        //
        map.addSource("staticPolygonsSource", {
            "type"   : "geojson",
            "data"   : oPolygonsStatic
        });
        map.addLayer({
            "id"     : "staticPolygonLayer",
            "type"   : "line",
            "source" : "staticPolygonsSource",
            'paint'  : {
                'line-opacity': 0.9,
                'line-color': [
                    "case",
                    ['==', ['get', "class_id"], 0], "#F9EBEA",
                    ['==', ['get', "class_id"], 1], "#F2D7D5",
                    ['==', ['get', "class_id"], 2], "#E6B0AA",
                    ['==', ['get', "class_id"], 3], "#D98880",
                    ['==', ['get', "class_id"], 4], "#CD6155",
                    ['==', ['get', "class_id"], 5], "#C0392B",
                    ['==', ['get', "class_id"], 6], "#A93226",
                    ['==', ['get', "class_id"], 7], "#922B21",
                    ['==', ['get', "class_id"], 8], "#7B241C",
                    ['==', ['get', "class_id"], 9], "#641E16",
                    '#ff0000'
                  ]
                }
        });
        map.addLayer({
            "id"     : "transparentPolygonLayer",
            "type"   : "fill",
            "source" : "staticPolygonsSource",
            'paint'  : {
                'fill-opacity': 0.0
            }
        });

        //
        // add the selected locations layer and source
        //
        map.addSource("selectedLocationsSource", {
            "type"   : "geojson",
            "data"   : oLocations
        });
        map.addLayer({
            "id"     : "selectedLocationsLayer",
            "type"   : "circle",
            "source" : "selectedLocationsSource",
            'maxzoom': 7,
            'paint'  : {
                "circle-radius" :
                {
                    'base' : 1.75,
                    'stops': [[1, 6], [22, 3]]
                },
                "circle-color"   : '#8A2BE2',
                'circle-opacity' : .1,
                'circle-stroke-color': '#FF00FF',
                'circle-stroke-width': 0.5,
                'circle-stroke-opacity' : .9
            }
        });

        //
        // add the areas layer and source
        //
        map.addSource("selectedPolygonsSource", {
            "type"   : "geojson",
            "data"   : oPolygonsSelected
        });
        map.addLayer({
            "id"     : "polygonLayer",
            "type"   : "fill",
            "source" : "selectedPolygonsSource",
            'paint'  : {
                'fill-opacity': 0.5,
                'fill-color': [
                    "case",
                    ['==', ['get', "class_id"], 0], "#F9EBEA",
                    ['==', ['get', "class_id"], 1], "#F2D7D5",
                    ['==', ['get', "class_id"], 2], "#E6B0AA",
                    ['==', ['get', "class_id"], 3], "#D98880",
                    ['==', ['get', "class_id"], 4], "#CD6155",
                    ['==', ['get', "class_id"], 5], "#C0392B",
                    ['==', ['get', "class_id"], 6], "#A93226",
                    ['==', ['get', "class_id"], 7], "#922B21",
                    ['==', ['get', "class_id"], 8], "#7B241C",
                    ['==', ['get', "class_id"], 9], "#641E16",
                    '#ff0000'
                  ]
                }
        });

        map.resize();

       addMapEventHandlers();

    });

    return(true);
}
//
// add map event handlers
//
function addMapEventHandlers()
{

    // Create a popup, but don't add it to the map yet.
    var popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    //
    // hover: state points
    //
    map.on('mouseenter', 'selectedLocationsLayer', function (e) {

        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = 'pointer';

        // get the point coordinates
        let coordinates = e.features[0].geometry.coordinates.slice();;

        // ensure the zoom level doesn't obscure the popup
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        // display the popup and set its coordinates
        popup.setLngLat(coordinates).setHTML("<div style='font-weight:bold; font-size:130%;'>" + e.features[0].properties.name + "</div><div>Deaths: " + e.features[0].properties.deaths + "</div><div>% of US: " + e.features[0].properties.percentDeaths + "</div>").addTo(map);

    });

    // Change it back to a hand when it leaves.
    map.on('mouseleave', 'selectedLocationsLayer', function () {
        popup.remove();
    });

    //
    // click/hover: states
    //
    map.on('click', 'transparentPolygonLayer', function (e) {

        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = 'pointer';

        let thisPolygonGeometry = e.features[0].geometry;

        flyToClickSelection(e.features[0]);

        let thisSelectedPolygon =
        {
            "type"     : "Feature",
            "geometry" : {},
            properties : {
                "name"          : e.features[0].properties.name,
                "deaths"        : e.features[0].properties.deaths,
                "percentDeaths" : e.features[0].properties.percentDeaths,
                "class_id"      : e.features[0].properties.class_id
            }
        }
        thisSelectedPolygon.geometry = thisPolygonGeometry;
        let aPolygonsSelected = [];
        aPolygonsSelected.push(thisSelectedPolygon);
        oPolygonsSelected = {
            "type" : "FeatureCollection",
            "features" : aPolygonsSelected
        };
        map.getSource('selectedPolygonsSource').setData(oPolygonsSelected);

        // update the vega chart
        let aCountyDeathRates = [];
        for (var i = 0; i < aCountyData.length; i++)
        {
            if ((aCountyData[i][0] == e.features[0].properties.name) && (aCountyDeathRates.length <= cMaxCounties))
            {
                // console.log(aCountyData[i][0] + " :: " + aCountyData[i][1]);
                aCountyDeathRates.push({
                    "a" : aCountyData[i][1],
                    "b" : aCountyData[i][2]
                });
            }
        }
        oCountyDeathRates = {
            "values": aCountyDeathRates
        }
        // console.log(oCountyDeathRates);

        //
        // refresh the react component by simulating a button click
        //
        aSelectedRecords = [e.features[0].properties.recordID];
        // console.log("Map Click Fired for recordID " + e.features[0].properties.recordID + "!");
        document.getElementById("appHeader").innerHTML = cAppTitle + " :: " + e.features[0].properties.name;
        document.getElementById("appHeader").click();
        aSelectedRecords = []; // clear the localized selection list

        // get the popup location
        var coordinates = e.lngLat;

        // ensure the zoom level doesn't obscure the popup
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        // display the popup and set its coordinates
        popup.setLngLat(coordinates).setHTML("<div style='font-weight:bold; font-size:130%;'>" + e.features[0].properties.name + "</div><div>Deaths: " + e.features[0].properties.deaths + "</div><div>% of US: " + e.features[0].properties.percentDeaths + "</div>").addTo(map);

    });

    // Change the cursor to a pointer when the mouse is over the state poly
    map.on('mouseenter', 'transparentPolygonLayer', function () {
        map.getCanvas().style.cursor = 'pointer';
    });

    // Change it back to a hand when it leaves.
    map.on('mouseleave', 'transparentPolygonLayer', function () {
        popup.remove();
    });

    return(true);

}

//
// initialize the block
//
initializeBlock(() => <AirliftMapbox />);

//
// fly to click selection
//
function flyToClickSelection(currentFeature)
{
    // get the bounding box for the feature
    if (currentFeature.properties.name == "Alaska")
    {
        // alaska traverses the anti-meridian (shit show ensues)
        // -179.148909	51.214183	179.77847	71.365162
        map.flyTo({
            center: [-151.59403512,63.74316310],
            zoom: 3
        });
    } else {
        let aBoundingBox = bbox(currentFeature);
        let boundingBox = [
            [aBoundingBox[0], aBoundingBox[1]],
            [aBoundingBox[2], aBoundingBox[3]]
        ];
        // fit the bounds on the map
        map.fitBounds(boundingBox, {
            padding: 60
        });
    }
}

//
// fly to selection
//
function flyToSelection(aThisSelection, stateName)
{
    if (stateName === "Alaska")
    {
        // alaska traverses the ante-meridian and mapbox has a bug (shit show ensues)
        // -179.148909	51.214183	179.77847	71.365162
        map.flyTo({
            center: [-151.59403512,63.74316310],
            zoom: 3
        });
    } else {
        // fit the bounds on the map
        try {
                // get the bounding box for the feature
                let aBoundingBox = bbox(aThisSelection[2]);
                let boundingBox = [
                    [aBoundingBox[2], aBoundingBox[3]],
                    [aBoundingBox[0], aBoundingBox[1]]
                ]
                map.fitBounds(boundingBox, {
                    padding: 60
                });
            // }
        } catch {
            map.flyTo({
                center: cMapCentroid,
                zoom: cMapZoom
            });
        }
    }
}

//
// determine the centroid of the location collection
//
function averageGeolocation(coords)
{
    if (coords.length === 1) {
      return coords[0];
    }

    let x = 0.0;
    let y = 0.0;
    let z = 0.0;

    for (var i in coords)
    {
        let latitude  = coords[i][1] * Math.PI / 180;
        let longitude = coords[i][0] * Math.PI / 180;
        x += Math.cos(latitude) * Math.cos(longitude);
        y += Math.cos(latitude) * Math.sin(longitude);
        z += Math.sin(latitude);
    }

    console.log(x);
    console.log(y);
    console.log(z);

    let total = coords.length;
    console.log(total);

    x = (x / total);
    y = (y / total);
    z = (z / total);

    let centralLongitude  = Math.atan2(y, x);
    let centralSquareRoot = Math.sqrt(x * x + y * y);
    let centralLatitude   = Math.atan2(z, centralSquareRoot);

    return ([centralLongitude * 180 / Math.PI, centralLatitude * 180 / Math.PI]);
}
