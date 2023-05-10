// react library
import React, { useState } from 'react';


// airtable model libraries
import { cursor } from '@airtable/blocks';

//import {useCursor} from "@airtable/blocks/ui"

// airtable ui libraries
import {
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    ViewPicker,
    useViewport,
    useSettingsButton,
    ViewPickerSynced,
    FormField,
    Box,
    useLoadable,
    useWatchable,
    
} from '@airtable/blocks/ui';

// mapbox libraries
import mapboxgl from 'mapbox-gl';

// other libraries
import * as turf from '@turf/turf'

import {FieldType} from '@airtable/blocks/models';


//
// set the map base
//
const mapGLStyle = "mapbox://styles/mapbox/light-v9";
//const mapGLStyle = "mapbox://styles/mapbox/satellite-v9";

//
// set the mapbox token
//
mapboxgl.accessToken = 'pk.eyJ1IjoicHliYW5hc3pha3RoZWZpZWxkIiwiYSI6ImNsOXg4ZGM5YjA4aHczc3BrMnljb242dHkifQ.6lqBaPacbMoOqOcSmj3PTw';


//
// establish the static vars
//
let AppTitle          = "Cartographie des enseignes AFM";
let thisBase;
let oLocations         = {};
let oBornes            = {};
let oClusters        = {};
//let oLogos             = [];

let oPolygonsSelected  = {};
let oBornesSelected    = {};

let cMapCentroid       = [0.35, 48];
let cMapZoom           = 5;
let cScrollZoom        = true;

let aSelectedRecords   = [];

// establish a global map object
let map;


function Settings() {
    const [isShowingSettings, setIsShowingSettings] = useState(false);

    useSettingsButton(function() {
        setIsShowingSettings(!isShowingSettings);
    });

    const [view, setView] = useState(null);
    const base = useBase();
    const table = base.getTableByNameIfExists("Enseignes");


    // If settings is showing, draw settings only
    if (isShowingSettings) {
        return (
            <Box padding={3} display="flex">
                <FormField
                    label="View"
                    description="Choose the View you want to your."
                    padding={1}
                    marginBottom={0}
                >
                        <ViewPickerSynced table={table} globalConfigKey="viewId" width="320px" />
                </FormField>
            </Box>
        )
    }
    // return to map
    return ( <AirliftMapbox
      />)
}



//
// main react component
//
function AirliftMapbox() {

    React.useEffect(() => {
        loadMap();
    }, []);

    // get the base
    thisBase           = useBase();

    // get the current view of the map app
    let thisQuery      = AppTitle;

    //
    // Enseignes table + Bornes & Reseau table
    //
    // get the tables
    const enseignesTable  = thisBase.getTableByNameIfExists('Enseignes');
    const bornesTable  = thisBase.getTableByNameIfExists('Bornes & Reseau');

    // get the views
    const enseignesView   = enseignesTable.getViewByNameIfExists('Locations');
    const bornesView   = bornesTable.getViewByNameIfExists('Locations');

    const enseignesSelectedFields = {
        fields: [
            'libelle',
            "enseigne",
            "logo",
            "adresse",
            "parking_place",
            "lat",
            "long",
            "proprietaire",
            "centre",
            "centre_p",
            "cluster",
            "cluster_p",
            "Places LOM",
            "Couleur"
        ],
    };

    const bornesSelectedFields = {
        fields: [
            'libelle',
            "enseigne",
            "logo",
            "adresse",
            "lat",
            "long",
            "Score"
        ],
    };
    
    // get the states records
    const vue = ViewPicker;
    const enseignesRecords = useRecords(enseignesView, enseignesSelectedFields);
    const bornesRecords = useRecords(bornesView, bornesSelectedFields);
    
    // watch the selections in airtable
    useLoadable(cursor);
    useWatchable(cursor, ['selectedRecordIds', 'selectedFieldIds']);

    // update the sites data
    updateEnseigne(enseignesTable, enseignesRecords, cursor);
    updateBornes(bornesTable, bornesRecords, cursor);

    // Generate the html
    const headerStyle = {
        height:          '32px',
        color:           'black',
        fontWeight:      'bold',
        paddingTop:      '6px',
        textAlign:       'center',
        fontSize:        '140%',
        background:      '#efefef',
        zIndex:          '100',
        position:       'absolute',
        bottom:         '0',
        width:          '100%'
    };

    const mapStyle = {
        position:       'absolute',
        top:            '0',
        bottom:         '0',
        width:          '100%'
    };

    return (
        <div>
            <div id='appHeader' style={headerStyle}>{thisQuery}</div>
            <div id='map' style={mapStyle}>
            </div>
            <link href="https://api.mapbox.com/mapbox-gl-js/v2.13.0/mapbox-gl.css" rel="stylesheet" />
        </div>
    )

}


//
// update the map data
//
function updateEnseigne(enseignesTable, enseignesRecords, cursor)
{

    console.log('updateEnseigne() FIRED!');

    // get the current list of selected records
    let currentSelectedRecords = (aSelectedRecords.length > 0) ? aSelectedRecords : cursor.selectedRecordIds;


    // enumerate the records
    let points               = [];
    let clusterPoints         = [];
    let pointsSelected       = [];
    //let logos                 = [];
    let thisSelection        = [];

    for (var i in enseignesRecords)
    {

        // get the name of the state
        let thisName = enseignesRecords[i].getCellValue("libelle");

        // get the lat/lng
        let thisLat  = enseignesRecords[i].getCellValue("lat");
        let thisLng  = enseignesRecords[i].getCellValue("long");

        // get other fields
        let enseigne = enseignesRecords[i].getCellValue("enseigne");
        let logo = enseignesRecords[i].getCellValue("logo");
        let proprietaire = enseignesRecords[i].getCellValue("proprietaire");
        let thisParkingsPlace = enseignesRecords[i].getCellValue("parking_place");
        let cluster = enseignesRecords[i].getCellValue("cluster");
        let centre = enseignesRecords[i].getCellValue("centre");
        let cluster_p = enseignesRecords[i].getCellValue("cluster_p");
        let centre_p = enseignesRecords[i].getCellValue("centre_p");
        let places_lom = enseignesRecords[i].getCellValue("Places LOM");
        let couleur = enseignesRecords[i].getCellValue("Couleur");

        // Clean data
        if (couleur === null){
            couleur = '';
        }
        else{
            couleur = couleur[0].value
        }

        
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
                    "parkings"      : thisParkingsPlace,
                    "enseigne"      : enseigne[0].name,
                    "logo_url"      : logo[0].value.url,
                    "logo_filename" : logo[0].value.filename,
                    "proprietaire"  : proprietaire,
                    "cluster"       : cluster,
                    "cluster_p"     : cluster_p,
                    "center"        : centre,
                    "center_p"      : centre_p,
                    "places_lom"    : places_lom,
                    "couleur"       : couleur,

                }
            }

            points.push(thisPoint);

            // // Add the logo to the array if it's not already there
            // let thisLogo = {
            //     "enseigne"    : enseigne[0].name,
            //     "logo" : logo[0].value.url
            // };
            // let LogoIndex = logos.findIndex(x => x.enseigne== enseigne[0].name); 
            // // here you can check specific property for an object whether it exist in your array or not
            // LogoIndex === -1 ? logos.push(thisLogo) : null;

            // Draw the cluster centroid
            if (centre == true){
              let thisCircle = turf.circle([parseFloat(thisLng), parseFloat(thisLat)], 1.5 , {steps: 30, units: 'kilometers', properties : {"cluster" : cluster}} );
              clusterPoints.push(thisCircle);
            }

            //
            // create the selected points/areas
            //
            if (currentSelectedRecords.indexOf(enseignesRecords[i].id) > -1)
            {

                // build the selected points for fly-to
                thisSelection.push([thisLng, thisLat]);

                // create the selected site point
                let thisSelectedPoint =
                {
                    "type"     : "Feature",
                    "geometry" : {
                        "type" : "line",
                        "coordinates" : [parseFloat(thisLng), parseFloat(thisLat)],
                    },
                    properties : {
                        "name"          : thisName,
                        "parkings"      : thisParkingsPlace,
                        "enseigne"      : enseigne[0].name,
                        "logo_url"      : logo[0].value.url,
                        "logo_filename" : logo[0].value.filename,
                        "proprietaire"  : proprietaire,
                        "cluster"       : cluster,
                        "cluster_p"     : cluster_p,
                        "center"        : centre,
                        "center_p"      : centre_p,
                        "places_lom"    : places_lom,
                        "couleur"       : couleur[0].value,
                    }
                }
                pointsSelected.push(thisSelectedPoint);

            }

        }

    }


    //
    // update the static features objects
    //
    oLocations = {
        "type" : "FeatureCollection",
        "features" : points
    };

    oPolygonsSelected = {
        "type" : "FeatureCollection",
        "features" : pointsSelected
    };

    oClusters = {
        "type" : "FeatureCollection",
        "features" : clusterPoints
    };


    //
    // is the map actually loaded?
    //
    if (map)
    {

        //map.getSource('selectedPoints').setData(oPolygonsSelected);

        //
        // fly to selection
        //
        if (currentSelectedRecords.length == 0) {
            // do nothing...
            document.getElementById("appHeader").innerHTML + AppTitle;
            //map.flyTo({center: [thisSelection[0][0], thisSelection[0][1]], zoom: 12});
            //flyToSelection(averageGeolocation([cMapCentroid]));
        } else if (currentSelectedRecords.length == 1) {
            // fly to the selected site
            //console.log(currentSelectedRecords);
            document.getElementById("appHeader").innerHTML = oPolygonsSelected.features[0].properties.name;
            //flyToSelection(averageGeolocation(thisSelection));
            map.flyTo({center: [thisSelection[0][0], thisSelection[0][1]], zoom: 13});
            //console.log(thisSelection);
        } else {
            // fly to the centroid of the selected sites
            document.getElementById("appHeader").innerHTML = AppTitle + " :: AFM";
            //flyToSelection(averageGeolocation(thisSelection))
        }
    }
    return(true);

}


//
// update the map data
//
function updateBornes(bornesTable, bornesRecords, cursor)
{

    console.log('updateBornes() FIRED!');

    // get the current list of selected records
    let currentSelectedRecords = (aSelectedRecords.length > 0) ? aSelectedRecords : cursor.selectedRecordIds;


    // enumerate the records
    let points               = [];
    let bornesSelected       = [];
    let thisSelection        = [];

    for (var i in bornesRecords)
    {

        // get the name of the state
        let thisName = bornesRecords[i].getCellValue("libelle");

        // get the lat/lng
        let thisLat  = bornesRecords[i].getCellValue("lat");
        let thisLng  = bornesRecords[i].getCellValue("long");

        // get other fields
        let enseigne = bornesRecords[i].getCellValue("enseigne");
        let logo = bornesRecords[i].getCellValue("logo");
        let score = bornesRecords[i].getCellValue("Score");
 
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
                    "enseigne"      : enseigne[0].name,
                    "logo_url"      : logo[0].value.url,
                    "logo_filename" : logo[0].value.filename,
                    "score"         : score,

                }
            }
            points.push(thisPoint);

            //
            // create the selected points/areas
            //

            if (currentSelectedRecords.indexOf(bornesRecords[i].id) > -1)
            {

                // build the selected points for fly-to
                thisSelection.push([thisLng, thisLat]);

                // create the selected site point
                let thisSelectedPoint =
                {
                    "type"     : "Feature",
                    "geometry" : {
                        "type" : "line",
                        "coordinates" : [parseFloat(thisLng), parseFloat(thisLat)],
                    },
                    properties : {
                        "name"          : thisName,
                        "enseigne"      : enseigne[0].name,
                        "logo_url"      : logo[0].value.url,
                        "logo_filename" : logo[0].value.filename,
                        "score"         : score,
                    }
                }
                bornesSelected.push(thisSelectedPoint);

            }

        }

    }

    oBornes = {
        "type" : "FeatureCollection",
        "features" : points
    };

    oBornesSelected = {
        "type" : "FeatureCollection",
        "features" : bornesSelected
    };


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

        //console.log('MAP WAS LOADED!');

        map.addControl(new mapboxgl.NavigationControl());

        // Add the image to the map style.
        //Load an image from an external URL.
        // oLogos.forEach(element => {
        //     map.loadImage(element.logo, (error, image) => {
        //     if (error) throw error;
        //     // Add the loaded image to the style's sprite with the ID 'kitten'.
        //         map.addImage(element.enseigne, image);
        //     });
        // });

        map.loadImage("https://cdn-icons-png.flaticon.com/512/4430/4430952.png", (error, image) => {
            if (error) throw error;
                map.addImage("borne", image);
        });
        
        //
        // add the selected locations layer and source
        //
        map.addSource("selectedLocationsSource", {
            "type"   : "geojson",
            "data"   : oLocations
        });

        map.addSource("selectedBornesSource", {
            "type"   : "geojson",
            "data"   : oBornes
        });

        map.addSource("selectedLocationsClusters", {
            "type"   : "geojson",
            "data"   : oClusters
        });

        map.addLayer({
            "id"     : "selectedClusterLayer",
            "type"   : "circle",
            "source" : "selectedLocationsSource",
            'maxzoom': 15,
            'paint'  : {
                "circle-radius" :
                {
                    'base' : 5,
                    'stops': [[2, 10], [5, 15],[10, 320]]
                },
                'circle-color': '#ccc',
                'circle-opacity' : .1,
                'circle-stroke-color': '#0cf46a',
                'circle-stroke-width': 1,
                'circle-stroke-opacity' : 1
            },
            "filter": ["all",
                ["==", "center", true],
                ["!=", "center_p", true]
            ]
        });

        map.addLayer({
            "id"     : "selectedClusterLayer2",
            "type"   : "circle",
            "source" : "selectedLocationsSource",
            'maxzoom': 15,
            'paint'  : {
                "circle-radius" :
                {
                    'base' : 5,
                    'stops': [[2, 10], [5, 15],[10, 320]]
                },
                'circle-color': '#ccc',
                'circle-opacity' : .1,
                'circle-stroke-color': '#FF00FF',
                'circle-stroke-width': 1,
                'circle-stroke-opacity' : 1
            },
            'filter': ['==', 'center_p', true]
        });

        // CLUSTER
        map.addLayer({
            "id"     : "selectedLocationsClusters",
            "type"   : "fill",
            "source" : "selectedLocationsClusters",
            'paint'  : {
                'fill-color': '#ccc',
                'fill-opacity' : .5,
                'fill-outline-color': '#333333'
            }
        });


        // ENSEIGNES
        map.addLayer({
        "id"     : "selectedLocationsLayer",
        "type"   : "circle",
        "source" : "selectedLocationsSource",
        'maxzoom': 20,
        'paint'  : {
            "circle-radius" :
            {
                'base' : 1.75,
                'stops': [[2, 1.75], [8, 5],[15, 25]]
            },
            'circle-color': ['get', 'couleur'],
            }   
        });

        // BORNES
        map.addLayer({
            "id"     : "selectedBornesLayer",
            "type"   : "symbol",
            "source" : "selectedBornesSource",
            'maxzoom': 20,
            'layout'  : {
                'icon-size': ['interpolate', ['exponential', 2], ['zoom'], 3, 0.010, 11, 0.030],
                'icon-image': "borne",
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
        closeOnClick: false,
        className: 'my-popup'
    });

    //
    // hover: state points
    //
    map.on('mouseenter', 'selectedLocationsLayer', function (e) {

        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = 'pointer';

        // get the point coordinates
        let coordinates = e.features[0].geometry.coordinates.slice();;

        // display the popup and set its coordinates
        popup.setLngLat(coordinates).setHTML("<img src='" + e.features[0].properties.logo_url + "' style='width:40px;' /> <div style='color:"+ e.features[0].properties.couleur + ";font-weight:bold; font-size:130%;'>" + e.features[0].properties.name + "</div> <div>Places LOM: <strong>" + e.features[0].properties.places_lom + "</strong></div><div>Contrat: <strong>" + e.features[0].properties.proprietaire + "</strong></div>").addTo(map);

    });


    // Change it back to a hand when it leaves.
    map.on('mouseleave', 'selectedLocationsLayer', function () {
        popup.remove();
    });

    //
    // hover: BORNES 
    //
    map.on('mouseenter', 'selectedBornesLayer', function (e) {

        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = 'pointer';

        // get the point coordinates
        let coordinates = e.features[0].geometry.coordinates.slice();;

        // display the popup and set its coordinates
        popup.setLngLat(coordinates).setHTML("<div style='font-weight:bold; font-size:130%;'>" + e.features[0].properties.name + "</div><div style='font-weight:bold; font-size:100%; text-transform: uppercase;'>" + e.features[0].properties.enseigne + "</div> <div>Score: <strong>" + e.features[0].properties.score + "</strong></div>").addTo(map);

    });


    // Change it back to a hand when it leaves.
    map.on('mouseleave', 'selectedBornesLayer', function () {
        popup.remove();
    });

    //
    // hover: state points
    //
    map.on('mouseenter', 'selectedClusterLayer', function (e) {

        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = 'pointer';

        // get the popup location
        var coordinates = e.lngLat;

        // display the popup and set its coordinates
        popup.setLngLat(coordinates).setHTML("<div style='font-weight:bold; font-size:130%;'>Cluster n°" + e.features[0].properties.cluster + "</div>").addTo(map);

    });


    // Change it back to a hand when it leaves.
    map.on('mouseleave', 'selectedClusterLayer', function () {
        popup.remove();
    });

    return(true);

}


//
// initialize the block
//
initializeBlock(() => <Settings/>);