// Initialisation de Mapbox
mapboxgl.accessToken = 'pk.eyJ1IjoibWFyY3Vzc2ltcGxlIiwiYSI6ImNseTNvb3hobzA5cWsybHBvenRmdHNxcmwifQ.ZQAMdmO7CT--DCeE1pLF_g';
var map;

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded");
    
    // Initialisation de la carte
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [-74.82608900230738, 45.76895453076196],
        zoom: 10
    });

    map.on('load', function() {
        console.log("Map loaded");
        setupEventListeners();
        populateQueryLists();
    });
});

// Liste des requêtes
const queries = [
    { 
        id: 1, 
        text: "Lister tous les nœuds", 
        type: "interrogation", 
        cypher: "MATCH (n:Node) RETURN n.id as id, n.longitude as longitude, n.latitude as latitude LIMIT $limit",
        customizable: true,
        customOptions: [
            { name: 'limit', type: 'number', default: 100, label: 'Nombre de nœuds à afficher' }
        ]
    },
    { 
        id: 2, 
        text: "Lister tous les thalwegs", 
        type: "interrogation", 
        cypher: "MATCH (t:Thalweg) RETURN t.id as id, t.geometry as geometry, t.accumulation as accumulation LIMIT $limit",
        customizable: true,
        customOptions: [
            { name: 'limit', type: 'number', default: 100, label: 'Nombre de thalwegs à afficher' }
        ]
    },
];

function populateQueryLists() {
    console.log("Populating query lists");
    queries.forEach(query => {
        const listItem = document.createElement('li');
        listItem.textContent = query.text;
        listItem.className = 'query-item';
        listItem.onclick = function() { 
            console.log(`Query clicked: ${query.text}`);
            if (query.customizable) {
                showCustomizationModal(query);
            } else {
                executeQuery(query.id);
            }
        };
        const listElement = document.getElementById(`${query.type}-list`);
        if (listElement) {
            listElement.appendChild(listItem);
        } else {
            console.error(`List element not found for type: ${query.type}`);
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

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
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

async function executeQuery(queryId, customParams = {}) {
    const query = queries.find(q => q.id === queryId);
    if (!query) {
        console.error('Requête non trouvée');
        return;
    }

    console.log(`Executing query: ${query.text}`);
    console.log('Custom params:', customParams);

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
                params: customParams
            }),
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        console.log("Received data:", data);

        if (data.results && data.results.length > 0) {
            updateMap(data.results, query.id);
        } else {
            console.log("No results returned from the query");
        }
    } catch (error) {
        console.error('Erreur lors de l\'exécution de la requête:', error);
    }
}

function updateMap(data, queryId) {
    console.log("Updating map with data:", data);

    // Supprimer les couches et sources existantes
    ['nodes', 'thalwegs', 'thalweg-points'].forEach(layer => {
        if (map.getLayer(layer)) map.removeLayer(layer);
        if (map.getSource(layer)) map.removeSource(layer);
    });

    const geojson = {
        type: 'FeatureCollection',
        features: []
    };

    const pointsGeojson = {
        type: 'FeatureCollection',
        features: []
    };

    if (queryId === 1) {  // Nœuds
        data.forEach(item => {
            geojson.features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(item.longitude), parseFloat(item.latitude)]
                },
                properties: item
            });
        });

        map.addSource('nodes', { type: 'geojson', data: geojson });
        map.addLayer({
            id: 'nodes',
            type: 'circle',
            source: 'nodes',
            paint: {
                'circle-radius': 6,
                'circle-color': 'red',
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff'
            }
        });
    } else if (queryId === 2) {  // Thalwegs
        data.forEach(thalweg => {
            // Ajouter chaque point du thalweg
            thalweg.coordinates.forEach((coord, index) => {
                pointsGeojson.features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: coord
                    },
                    properties: {
                        id: `${thalweg.id}-${index}`,
                        thalwegId: thalweg.id,
                        pointIndex: index
                    }
                });
            });

            // Ajouter la polyligne complète du thalweg
            geojson.features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: thalweg.coordinates
                },
                properties: {
                    id: thalweg.id,
                    accumulation: thalweg.accumulation
                }
            });
        });

        // Ajouter la source et la couche pour les thalwegs
        map.addSource('thalwegs', { type: 'geojson', data: geojson });
        map.addLayer({
            id: 'thalwegs',
            type: 'line',
            source: 'thalwegs',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'accumulation'],
                    0, '#00ffff',
                    100, '#0000ff',
                    200, '#ff00ff',
                    300, '#ff0000'
                ],
                'line-width': [
                    'interpolate',
                    ['linear'],
                    ['get', 'accumulation'],
                    0, 1,
                    300, 5
                ]
            }
        });

        // Ajouter la source et la couche pour les points de thalweg
        map.addSource('thalweg-points', { type: 'geojson', data: pointsGeojson });
        map.addLayer({
            id: 'thalweg-points',
            type: 'circle',
            source: 'thalweg-points',
            paint: {
                'circle-radius': 3,
                'circle-color': 'yellow',
                'circle-stroke-width': 1,
                'circle-stroke-color': 'black'
            }
        });
    }

    // Ajuster la vue de la carte
    if (geojson.features.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        geojson.features.forEach(feature => {
            if (feature.geometry.type === 'Point') {
                bounds.extend(feature.geometry.coordinates);
            } else if (feature.geometry.type === 'LineString') {
                feature.geometry.coordinates.forEach(coord => {
                    bounds.extend(coord);
                });
            }
        });
        map.fitBounds(bounds, { padding: 50 });
    }

    addPopupInteractions(queryId);
}

function addPopupInteractions(queryId) {
    if (queryId === 1) {
        map.on('click', 'nodes', function(e) {
            var coordinates = e.features[0].geometry.coordinates.slice();
            var properties = e.features[0].properties;
            var description = `<strong>Nœud</strong><br>
                               <strong>ID:</strong> ${properties.id}<br>
                               <strong>Longitude:</strong> ${coordinates[0]}<br>
                               <strong>Latitude:</strong> ${coordinates[1]}`;
            
            new mapboxgl.Popup()
                .setLngLat(coordinates)
                .setHTML(description)
                .addTo(map);
        });

        map.on('mouseenter', 'nodes', function() {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'nodes', function() {
            map.getCanvas().style.cursor = '';
        });
    } else if (queryId === 2) {
        map.on('click', 'thalwegs', function(e) {
            var coordinates = e.lngLat;
            var properties = e.features[0].properties;
            var description = `<strong>Thalweg</strong><br>
                               <strong>ID:</strong> ${properties.id}<br>
                               <strong>Accumulation:</strong> ${properties.accumulation}`;
            
            new mapboxgl.Popup()
                .setLngLat(coordinates)
                .setHTML(description)
                .addTo(map);
        });

        map.on('mouseenter', 'thalwegs', function() {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'thalwegs', function() {
            map.getCanvas().style.cursor = '';
        });
    }
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

function setupEventListeners() {
    document.querySelectorAll('.query-type').forEach(element => {
        element.addEventListener('click', function() {
            const type = this.getAttribute('data-type');
            console.log(`Clicked on query type: ${type}`);
            toggleQueryList(type);
        });
    });
}

function toggleQueryList(type) {
    const list = document.getElementById(`${type}-list`);
    if (list) {
        list.style.display = list.style.display === 'none' || list.style.display === '' ? 'block' : 'none';
    }
}