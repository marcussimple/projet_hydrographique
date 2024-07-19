// Initialisation de Mapbox
mapboxgl.accessToken = 'pk.eyJ1IjoibWFyY3Vzc2ltcGxlIiwiYSI6ImNseTNvb3hobzA5cWsybHBvenRmdHNxcmwifQ.ZQAMdmO7CT--DCeE1pLF_g';
var map;
let selectedThalwegId = null;
let isSelectingThalweg = false;

// Liste des requêtes
const queries = [
    { 
        id: 1, 
        text: "Lister tous les nœuds", 
        type: "interrogation", 
        cypher: "MATCH (n:Node) RETURN n.id as id, n.longitude as longitude, n.latitude as latitude, n.z as altitude $limit",
        customizable: true,
        customOptions: [
            { name: 'limit', type: 'number', default: 100, label: 'Nombre de nœuds à afficher' }
        ]
    },
    { 
        id: 2, 
        text: "Lister tous les cours d'eau", 
        type: "interrogation", 
        cypher: "MATCH (t:Thalweg) RETURN t.id as id, t.geometry as geometry, t.accumulation as accumulation, t.slope as slope",
        customizable: false,
        /*customOptions: [
            { name: 'limit', type: 'number', default: 28000, label: 'Nombre de thalwegs à afficher' }
        ]*/
    },
    { 
        id: 3, 
        text: "Afficher les nœuds entre deux altitudes", 
        type: "interrogation", 
        cypher: `
        MATCH (t:Node)
        WITH t, CASE WHEN $X IS NULL THEN 0 ELSE $X END AS minZ, CASE WHEN $Y IS NULL THEN max(t.z) ELSE $Y END AS maxZ
        WHERE t.z > minZ AND t.z < maxZ
        RETURN t.id as id, t.longitude as longitude, t.latitude as latitude, t.z as altitude
        `,
        customizable: true,
        customOptions: [
            { name: 'X', type: 'number', default: null, label: 'Altitude minimale (laisser vide pour 0)' },
            { name: 'Y', type: 'number', default: null, label: 'Altitude maximale (laisser vide pour max)' }
        ]
    },
    { 
        id: 4, 
        text: "Afficher les cours d'eau en amont", 
        type: "validation", 
        cypher: "CALL custom.getUpstreamThalwegs($thalwegId)",
        customizable: false
    },
    { 
        id: 5, 
        text: "Afficher les cours d'eau en aval", 
        type: "validation", 
        cypher: "CALL custom.getDownstreamThalwegs($thalwegId)",
        customizable: false
    },
    { 
        id: 6, 
        text: "Afficher les thalwegs et les ridges", 
        type: "interrogation", 
        cypher: "CALL custom.getThalwegAndRidge()",
        customizable: false
    }
];

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded");
    initializeMap();
});

function initializeMap() {
    console.log("Initializing map");
    map = new mapboxgl.Map({
        container: 'map', // assurez-vous que cet élément existe dans votre HTML
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [-74.82608900230738, 45.76895453076196],
        zoom: 10
    });

    // Ajoutez un bouton pour activer la sélection de thalweg
    const controlContainer = document.createElement('div');
    controlContainer.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
    
    const selectButton = document.createElement('button');
    selectButton.textContent = 'Sélectionner un thalweg';
    selectButton.onclick = enableThalwegSelection;
    
    controlContainer.appendChild(selectButton);
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl({ onAdd: () => controlContainer, onRemove: () => {} }, 'top-left');

    map.on('load', function() {
        console.log("Map loaded");
        setupEventListeners();
        populateQueryLists();
        updateInteractions();
    });
}

function showLoading() {
    console.log('Showing loading overlay');
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    console.log('Hiding loading overlay');
    document.getElementById('loading-overlay').style.display = 'none';
}

function populateQueryLists() {
    console.log("Populating query lists");
    
    // Vider les listes existantes
    document.getElementById('interrogation-list').innerHTML = '';
    document.getElementById('validation-list').innerHTML = '';
    document.getElementById('statistique-list').innerHTML = '';

    queries.forEach(query => {
        const queryItem = document.createElement('div');
        queryItem.textContent = query.text;
        queryItem.className = 'query-item';
        
        queryItem.onclick = function() { 
            console.log(`Query clicked: ${query.text}`);
            if (query.type === "validation") {
                if (selectedThalwegId) {
                    executeQuery(query.id, { thalwegId: selectedThalwegId });
                } else {
                    showMessage("Veuillez d'abord sélectionner un thalweg sur la carte.");
                }
            } else if (query.customizable) {
                showCustomizationModal(query);
            } else {
                executeQuery(query.id);
            }
        };

        const listElement = document.getElementById(`${query.type}-list`);
        if (listElement) {
            listElement.appendChild(queryItem);
        } else {
            console.error(`List element not found for type: ${query.type}`);
        }
    });

    // Afficher les listes qui contiennent des éléments
    ['interrogation', 'validation', 'statistique'].forEach(type => {
        const list = document.getElementById(`${type}-list`);
        const queryType = document.querySelector(`.query-type[data-type="${type}"]`);
        if (list.children.length > 0) {
            list.style.display = 'block';
            queryType.style.display = 'block';
        } else {
            list.style.display = 'none';
            queryType.style.display = 'none';
        }
    });
}

function showCustomizationModal(query) {
    const modal = document.getElementById('customizationModal');
    const optionsContainer = document.getElementById('customizationOptions');
    optionsContainer.innerHTML = '';

    query.customOptions.forEach(option => {
        const label = document.createElement('label');
        label.textContent = option.label;
        const input = document.createElement('input');
        input.type = option.type;
        input.name = option.name;
        input.value = option.default;
        optionsContainer.appendChild(label);
        optionsContainer.appendChild(input);
    });

    modal.style.display = 'block';

    document.querySelector('.close').onclick = function() {
        modal.style.display = 'none';
    };

    document.getElementById('executeCustomQuery').onclick = function() {
        const customParams = {};
        query.customOptions.forEach(option => {
            const input = document.querySelector(`input[name="${option.name}"]`);
            customParams[option.name] = input.value;
        });
        console.log('Custom params before execution:', customParams);
        executeQuery(query.id, customParams);
        modal.style.display = 'none';
    };
}

function setupEventListeners() {
    document.querySelectorAll('.query-type').forEach(element => {
        element.addEventListener('click', function() {
            const type = this.getAttribute('data-type');
            console.log(`Clicked on query type: ${type}`);
            toggleQueryList(type);
        });
    });

    setupThalwegSelection();
}

function toggleQueryList(type) {
    const list = document.getElementById(`${type}-list`);
    if (list) {
        list.style.display = list.style.display === 'none' || list.style.display === '' ? 'block' : 'none';
    }
}

function parseLineString(geometryString) {
    const match = geometryString.match(/LINESTRING Z \((.*)\)/);
    if (match) {
        const coordinates = match[1].split(', ').map(coord => {
            const [lon, lat, z] = coord.split(' ').map(parseFloat);
            if (isValidCoordinate([lon, lat])) {
                return [lon, lat];
            }
            console.warn(`Invalid coordinate in LineString: ${coord}`);
            return null;
        }).filter(coord => coord !== null);
        return coordinates.length > 0 ? coordinates : null;
    }
    return null;
}

function setupThalwegSelection() {
    map.on('click', 'thalwegs', function(e) {
        const thalwegId = e.features[0].properties.id;
        selectThalweg(thalwegId);
    });

    document.getElementById('select-thalweg-button').addEventListener('click', function() {
        const thalwegId = document.getElementById('thalweg-id-input').value;
        if (thalwegId) {
            selectThalweg(parseInt(thalwegId));
        } else {
            showMessage("Veuillez entrer un ID de thalweg valide.");
        }
    });
}

function selectThalweg(thalwegId) {
    selectedThalwegId = thalwegId;
    document.getElementById('thalweg-id-input').value = thalwegId;
    
    //showLoading(); // Afficher l'animation de chargement

    // Mettre à jour la couleur du thalweg sélectionné sur la carte
    map.setPaintProperty('thalwegs', 'line-color', [
        'case',
        ['==', ['get', 'id'], selectedThalwegId],
        '#0000FF',  // Bleu foncé pour le thalweg sélectionné
        '#819FF7'   // Bleu pale pour les autres thalwegs                      ---------------------------------- SELECTED THALWEG COLOR--------------------
    ]);

    // Récupérer les informations du thalweg sélectionné
    fetch('/get_thalweg_info/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ thalwegId: selectedThalwegId }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erreur réseau lors de la récupération des informations du thalweg');
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        updateSelectedThalwegInfo(data);
        zoomToThalweg(data.coordinates);
    })
    .catch(error => {
        console.error('Erreur lors de la récupération des informations du thalweg:', error);
        showMessage("Erreur lors de la récupération des informations du thalweg.");
    })
    .finally(() => {
        hideLoading(); // Cacher l'animation de chargement, que la requête réussisse ou échoue
    });
}

function zoomToThalweg(coordinates) {
    if (coordinates && coordinates.length > 0) {
        const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

        map.fitBounds(bounds, {
            padding: 50,  // Ajoute un peu d'espace autour du thalweg
            duration: 1000  // Durée de l'animation en millisecondes
        });
    }
}

function updateSelectedThalwegInfo(properties) {
    const infoDiv = document.getElementById('selected-thalweg-info');
    infoDiv.innerHTML = `
        <div class="thalweg-info">
            <h4>Cours d'eau sélectionné</h4>
            <p><strong>ID:</strong> ${properties.id}</p>
            <p><strong>Accumulation:</strong> ${properties.accumulation}</p>
            <p><strong>Pente:</strong> ${properties.slope ? properties.slope.toFixed(2) + '°' : 'N/A'}</p>
        </div>
    `;
}

function updateUpstreamThalwegsInfo(thalwegs) {
    const infoDiv = document.getElementById('upstream-thalwegs-info');
    infoDiv.innerHTML = thalwegs.map((thalweg, index) => `
        <div class="thalweg-info ${index % 2 === 0 ? 'even' : 'odd'}" style="background-color: #90EE90;">
            <p><strong>ID:</strong> ${thalweg.upstreamId}</p>
            <p><strong>Accumulation:</strong> ${thalweg.accumulation || 'N/A'}</p>
            <p><strong>Pente:</strong> ${thalweg.slope ? thalweg.slope.toFixed(2) + '°' : 'N/A'}</p>
            <p><strong>Profondeur:</strong> ${thalweg.depth}</p>
        </div>
    `).join('');
}

function updateDownstreamThalwegsInfo(thalwegs) {
    const infoDiv = document.getElementById('upstream-thalwegs-info');
    infoDiv.innerHTML = thalwegs.map((thalweg, index) => `
        <div class="thalweg-info ${index % 2 === 0 ? 'even' : 'odd'}" style="background-color: #FFB6C1;">
            <p><strong>ID:</strong> ${thalweg.downstreamId}</p>
            <p><strong>Accumulation:</strong> ${thalweg.accumulation || 'N/A'}</p>
            <p><strong>Pente:</strong> ${thalweg.slope ? thalweg.slope.toFixed(2) + '°' : 'N/A'}</p>
            <p><strong>Profondeur:</strong> ${thalweg.depth}</p>
        </div>
    `).join('');
}


async function executeQuery(queryId, customParams = {}) {
    const query = queries.find(q => q.id === queryId);
    if (!query) {
        console.error('Requête non trouvée');
        return;
    }

    console.log(`Executing query: ${query.text}`);
    console.log('Custom params:', customParams);

    showLoading();

    const convertedParams = {};
    for (const [key, value] of Object.entries(customParams)) {
        if (value === '') {
            convertedParams[key] = null;
        } else if (key === 'limit') {
            convertedParams[key] = parseInt(value, 10);
        } else if (['X', 'Y'].includes(key)) {
            convertedParams[key] = parseFloat(value);
        } else {
            convertedParams[key] = value;
        }
    }

    try {
        const response = await fetch('/execute_query/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({ 
                cypher: query.cypher, 
                queryId: query.id,
                params: convertedParams
            }),
        });

        const data = await response.json();
        console.log("Received data:", data);

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}, Message: ${data.error || 'Erreur inconnue'}`);
        }

        if (data.error) {
            throw new Error(data.error);
        }

        if (data.results && data.results.length > 0) {
            console.log(`Updating map with ${data.results.length} results for query ${queryId}`);
            updateMap(data.results, queryId);
        } else {
            console.log("No results returned from the query");
            if (queryId === 4) {
                showNoUpstreamMessage();
            } else {
                showMessage("Aucun résultat trouvé pour cette requête.");
            }
        }
    } catch (error) {
        console.error('Erreur lors de l\'exécution de la requête:', error);
        showMessage(`Une erreur s'est produite lors de l'exécution de la requête: ${error.message}`);
    } finally {
        hideLoading();
    }
}


function parseRidgeGeometry(geometryString) {
    const match = geometryString.match(/LINESTRING Z \((.*)\)/);
    if (match) {
        const coordinates = match[1].split(', ').map(coord => {
            const [lon, lat] = coord.split(' ').map(parseFloat);
            return [lon, lat];
        });
        return coordinates;
    }
    return null;
}




function updateMap(data, queryId) {
    console.log("Updating map with data:", data);
    console.log("Query ID:", queryId);

    const thalwegLinesGeojson = {
        type: 'FeatureCollection',
        features: []
    };

    const ridgeLinesGeojson = {
        type: 'FeatureCollection',
        features: []
    };

    const nodesGeojson = {
        type: 'FeatureCollection',
        features: []
    };

    if (queryId === 1 || queryId === 3) {
        // Traitement des nœuds
        data.forEach(node => {
            if (isValidCoordinate([node.longitude, node.latitude])) {
                nodesGeojson.features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [node.longitude, node.latitude]
                    },
                    properties: {
                        id: node.id,
                        altitude: node.altitude,
                        nodeType: 'other'
                    }
                });
            } else {
                console.warn(`Invalid node coordinates: [${node.longitude}, ${node.latitude}]`);
            }
        });
    } else if (queryId === 2 || queryId === 4 || queryId === 5 || queryId === 6) {
        // Traitement des thalwegs et ridges
        data.forEach(item => {
            const coordinates = item.coordinates || parseLineString(item.geometry);
            if (coordinates && coordinates.length > 0) {
                const feature = {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
                    },
                    properties: {
                        id: item.id,
                        type: item.type || 'thalweg',
                        accumulation: item.accumulation,
                        slope: item.slope,
                        depth: item.depth,
                        valleyId: item.valleyId
                    }
                };

                if (item.type === 'ridge') {
                    ridgeLinesGeojson.features.push(feature);
                } else {
                    thalwegLinesGeojson.features.push(feature);
                }

                // Ajouter les nœuds de début et de fin
                [coordinates[0], coordinates[coordinates.length - 1]].forEach((coord, index) => {
                    if (isValidCoordinate(coord)) {
                        nodesGeojson.features.push({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: coord
                            },
                            properties: {
                                id: `${feature.properties.id}-${index === 0 ? 'start' : 'end'}`,
                                parentId: feature.properties.id,
                                parentType: feature.properties.type,
                                nodeType: queryId === 4 ? 'upstream' : (queryId === 5 ? 'downstream' : 'other')
                            }
                        });
                    }
                });
            }
        });
    }

    console.log("Thalweg features:", thalwegLinesGeojson.features.length);
    console.log("Ridge features:", ridgeLinesGeojson.features.length);
    console.log("Node features:", nodesGeojson.features.length);

    // Mise à jour des couches
    const layerPrefix = queryId === 4 ? 'upstream' : (queryId === 5 ? 'downstream' : '');
    const thalwegColor = queryId === 4 ? '#00FF00' : (queryId === 5 ? '#FE2E2E' : '#0000FF');

    updateLayer(`${layerPrefix}thalwegs`, thalwegLinesGeojson, {
        type: 'line',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': thalwegColor,
            'line-width': 3
        }
    });

    if (queryId === 6) {
        updateLayer('ridges', ridgeLinesGeojson, {
            type: 'line',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#FFA500', // Orange pour les ridges
                'line-width': 2
            }
        });
    }

    updateLayer(`${layerPrefix}nodes`, nodesGeojson, {
        type: 'circle',
        paint: {
            'circle-radius': 2.5,
            'circle-color': [
                'match',
                ['get', 'nodeType'],
                'upstream', '#00FF00',  // Vert pour les nœuds en amont
                'downstream', '#FF0000', // Rouge pour les nœuds en aval
                '#000000'  // Noir pour les autres nœuds
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#000000'  // Contour noir pour tous les nœuds
        }
    });

    // Combiner toutes les caractéristiques pour le zoom
    const allFeatures = {
        type: 'FeatureCollection',
        features: [
            ...thalwegLinesGeojson.features,
            ...ridgeLinesGeojson.features,
            ...nodesGeojson.features
        ]
    };

    console.log("Total features for fitMapToFeatures:", allFeatures.features.length);

    const zoomOptions = {
        minZoom: queryId === 4 ? 12 : 10,
        maxZoom: 15,
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        duration: 1000
    };

    fitMapToFeatures(allFeatures, zoomOptions);

    // Mettre à jour les interactions
    updateInteractions();

    // Mise à jour des informations affichées (si nécessaire)
    if (queryId === 4) {
        updateThalwegsInfo(data, 'upstream');
    } else if (queryId === 5) {
        updateThalwegsInfo(data, 'downstream');
    }
}

function updateInteractions() {
    const layers = ['thalwegs', 'upstreamthalwegs', 'downstreamthalwegs'];
    
    layers.forEach(layer => {
        if (map.getLayer(layer)) {
            map.off('mouseenter', layer);
            map.off('mouseleave', layer);
            map.off('click', layer);

            map.on('mouseenter', layer, function() {
                map.getCanvas().style.cursor = isSelectingThalweg ? 'pointer' : '';
            });

            map.on('mouseleave', layer, function() {
                map.getCanvas().style.cursor = '';
            });

            map.on('click', layer, function(e) {
                if (isSelectingThalweg) {
                    const feature = e.features[0];
                    selectedThalwegId = feature.properties.id;
                    console.log("Thalweg sélectionné:", selectedThalwegId);
                    isSelectingThalweg = false;
                    map.getCanvas().style.cursor = '';
                    // Ici, vous pouvez ajouter du code pour mettre en évidence le thalweg sélectionné
                }
            });
        }
    });
}

function enableThalwegSelection() {
    isSelectingThalweg = true;
    map.getCanvas().style.cursor = 'pointer';
}


function updateThalwegsInfo(thalwegs, type) {
    const infoDiv = document.getElementById('upstream-thalwegs-info');
    infoDiv.innerHTML = thalwegs.map((thalweg, index) => `
        <div class="thalweg-info ${index % 2 === 0 ? 'even' : 'odd'}" style="background-color: ${type === 'upstream' ? '#90EE90' : '#FFB6C1'};">
            <p><strong>ID:</strong> ${thalweg[type + 'Id']}</p>
            <p><strong>Profondeur:</strong> ${thalweg.depth}</p>
            <p><strong>ID Vallée:</strong> ${thalweg.valleyId}</p>
        </div>
    `).join('');
}


function updateUpstreamRidgesInfo(data) {
    const infoDiv = document.getElementById('upstream-thalwegs-info');
    infoDiv.innerHTML = data.flatMap(thalweg => 
        thalweg.ridges.map((ridge, index) => `
            <div class="ridge-info ${index % 2 === 0 ? 'even' : 'odd'}" style="background-color: #FFC0CB;">
                <p><strong>Ridge ID:</strong> ${ridge.id}</p>
                <p><strong>Thalweg associé:</strong> ${thalweg.upstreamId}</p>
                <p><strong>Profondeur du thalweg:</strong> ${thalweg.depth}</p>
            </div>
        `)
    ).join('');
}


function updateLayer(layerId, geojsonData, layerOptions) {
    if (map.getSource(layerId)) {
        map.getSource(layerId).setData(geojsonData);
    } else {
        map.addSource(layerId, {
            type: 'geojson',
            data: geojsonData
        });
        map.addLayer({
            id: layerId,
            source: layerId,
            ...layerOptions
        });
    }
}

function addEndpoints(thalweg, endpointsGeojson, isUpstream = false) {
    const startPoint = thalweg.coordinates[0];
    const endPoint = thalweg.coordinates[thalweg.coordinates.length - 1];
    const id = isUpstream ? thalweg.upstreamId : thalweg.downstreamId;
    
    [startPoint, endPoint].forEach((point, index) => {
        endpointsGeojson.features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: point
            },
            properties: {
                id: `${id}-${index === 0 ? 'start' : 'end'}`,
                thalwegId: id,
                pointType: index === 0 ? 'start' : 'end',
                isUpstream: isUpstream
            }
        });
    });
}

function isValidCoordinate(coord) {
    return Array.isArray(coord) && 
           coord.length === 2 && 
           typeof coord[0] === 'number' && 
           typeof coord[1] === 'number' &&
           coord[0] >= -180 && coord[0] <= 180 && 
           coord[1] >= -90 && coord[1] <= 90;
}


function fitMapToFeatures(geojson, options = {}) {
    console.log("fitMapToFeatures called with:", JSON.stringify(geojson));
    console.log("Options:", options);

    if (!geojson.features || geojson.features.length === 0) {
        console.warn('No features to fit map to');
        return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    let hasValidFeatures = false;

    geojson.features.forEach((feature, index) => {
        console.log(`Processing feature ${index}:`, JSON.stringify(feature));

        if (feature.geometry && feature.geometry.coordinates) {
            if (feature.geometry.type === 'Point' && isValidCoordinate(feature.geometry.coordinates)) {
                bounds.extend(feature.geometry.coordinates);
                hasValidFeatures = true;
            } else if (feature.geometry.type === 'LineString') {
                feature.geometry.coordinates.forEach(coord => {
                    if (isValidCoordinate(coord)) {
                        bounds.extend(coord);
                        hasValidFeatures = true;
                    } else {
                        console.warn(`Invalid coordinate in LineString: ${JSON.stringify(coord)}`);
                    }
                });
            } else if (feature.geometry.type === 'Polygon') {
                feature.geometry.coordinates[0].forEach(coord => {
                    if (isValidCoordinate(coord)) {
                        bounds.extend(coord);
                        hasValidFeatures = true;
                    } else {
                        console.warn(`Invalid coordinate in Polygon: ${JSON.stringify(coord)}`);
                    }
                });
            }
        }
    });

    console.log("Bounds after processing:", bounds.toString());

    if (hasValidFeatures && !bounds.isEmpty()) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const latDiff = Math.abs(ne.lat - sw.lat);
        const lngDiff = Math.abs(ne.lng - sw.lng);
        const maxDiff = Math.max(latDiff, lngDiff);

        // Calculate appropriate zoom level
        let zoom = Math.floor(Math.log2(360 / maxDiff)) + 1;
        console.log("Calculated initial zoom:", zoom);

        // Adjust zoom based on options
        zoom = Math.min(zoom, options.maxZoom || 15);
        zoom = Math.max(zoom, options.minZoom || 10);

        console.log("Final zoom after adjustments:", zoom);

        const padding = options.padding || { top: 50, bottom: 50, left: 50, right: 50 };
        const duration = options.duration || 1000;

        console.log("Fitting map with options:", {
            bounds: bounds.toString(),
            padding,
            zoom,
            duration
        });

        map.fitBounds(bounds, {
            padding,
            maxZoom: options.maxZoom || 15,
            zoom,
            duration
        });
    } else {
        console.warn('No valid features to fit map to or bounds are empty');
    }
}


function addPopupInteractions() {
    const layers = ['nodes', 'thalwegs', 'upstream-thalwegs', 'thalweg-endpoints', 'upstream-thalweg-endpoints'];
    
    layers.forEach(layer => {
        if (map.getLayer(layer)) {
            map.off('click', layer);
            map.on('click', layer, function(e) {
                const feature = e.features[0];
                const coordinates = feature.geometry.type === 'Point' ? 
                    feature.geometry.coordinates.slice() :
                    e.lngLat;
                
                let description = createPopupContent(feature, layer);

                new mapboxgl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(description)
                    .addTo(map);
            });

            map.on('mouseenter', layer, function() {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', layer, function() {
                map.getCanvas().style.cursor = '';
            });
        }
    });
}

function createPopupContent(feature, layer) {
    const properties = feature.properties;
    let description = '';

    switch(layer) {
        case 'nodes':
            description = `<strong>Node</strong><br>
                           <strong>ID:</strong> ${properties.id}<br>
                           <strong>Longitude:</strong> ${feature.geometry.coordinates[0]}<br>
                           <strong>Latitude:</strong> ${feature.geometry.coordinates[1]}<br>
                           <strong>Altitude:</strong> ${properties.altitude}`;
            break;
        case 'thalwegs':
        case 'upstream-thalwegs':
            description = `<strong>Thalweg</strong><br>
                           <strong>ID:</strong> ${properties.id}<br>`;
            if (properties.accumulation !== undefined) {
                description += `<strong>Accumulation:</strong> ${properties.accumulation}<br>
                                <strong>Pente:</strong> ${properties.slope.toFixed(2)}°`;
            } else if (properties.depth !== undefined) {
                description += `<strong>Profondeur:</strong> ${properties.depth}<br>
                                <strong>ID Vallée:</strong> ${properties.valleyId}`;
            }
            break;
        case 'thalweg-endpoints':
        case 'upstream-thalweg-endpoints':
            description = `<strong>${properties.pointType === 'start' ? 'Début' : 'Fin'} de Thalweg</strong><br>
                           <strong>Thalweg ID:</strong> ${properties.thalwegId}<br>
                           <strong>Longitude:</strong> ${feature.geometry.coordinates[0]}<br>
                           <strong>Latitude:</strong> ${feature.geometry.coordinates[1]}`;
            if (properties.isUpstream) {
                description += '<br><strong>Thalweg en amont</strong>';
            }
            break;
    }

    return description;
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function showNoUpstreamMessage() {
    const alertContainer = document.createElement('div');
    alertContainer.style.position = 'absolute';
    alertContainer.style.top = '20px';
    alertContainer.style.left = '50%';
    alertContainer.style.transform = 'translateX(-50%)';
    alertContainer.style.backgroundColor = 'white';
    alertContainer.style.padding = '10px';
    alertContainer.style.borderRadius = '5px';
    alertContainer.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    alertContainer.style.zIndex = '1000';
    alertContainer.innerHTML = 'Aucun thalweg en amont trouvé pour le thalweg sélectionné.';

    document.body.appendChild(alertContainer);

    setTimeout(() => {
        document.body.removeChild(alertContainer);
    }, 3000);
}

function showMessage(message) {
    const alertContainer = document.createElement('div');
    alertContainer.style.position = 'absolute';
    alertContainer.style.top = '20px';
    alertContainer.style.left = '50%';
    alertContainer.style.transform = 'translateX(-50%)';
    alertContainer.style.backgroundColor = 'white';
    alertContainer.style.padding = '10px';
    alertContainer.style.borderRadius = '5px';
    alertContainer.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    alertContainer.style.zIndex = '1000';
    alertContainer.innerHTML = message;

    document.body.appendChild(alertContainer);

    setTimeout(() => {
        document.body.removeChild(alertContainer);
    }, 3000);
}

