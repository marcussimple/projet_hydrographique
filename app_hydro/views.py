from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from neo4j import GraphDatabase
import re
import logging

# Configuration de la connexion Neo4j
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "password"  # Remplacez par votre mot de passe réel
NEO4J_DATABASE = "hydronetwork"


driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

# Configurez le logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def index(request):
    return render(request, 'index.html')

def parse_linestring(geometry_string):
    coordinates_match = re.search(r'LINESTRING Z \((.*?)\)', geometry_string)
    if coordinates_match:
        coordinates_str = coordinates_match.group(1)
        points = coordinates_str.split(', ')
        return [[float(point.split()[0]), float(point.split()[1])] for point in points]
    logger.warning(f"Could not parse geometry string: {geometry_string}")
    return []

def format_upstream_downstream_results(records):
    formatted_results = []
    for record in records:
        coordinates = parse_linestring(record['upstreamGeometry'])
        if coordinates:
            formatted_result = {
                "upstreamId": record['upstreamId'],
                "depth": record['depth'],
                "valleyId": record['valleyId'],
                "coordinates": coordinates
            }
            formatted_results.append(formatted_result)
        else:
            logger.warning(f"Empty coordinates for thalweg {record['upstreamId']}")
    
    logger.info(f"Formatted {len(formatted_results)} upstream thalwegs")
    return formatted_results

@csrf_exempt
def execute_query(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        cypher = data.get('cypher', '')
        query_id = data.get('queryId')
        params = data.get('params', {})
        
        print(f"Received query: {cypher}")
        print(f"Received params: {params}")

        logger.info(f"Received query: {cypher}")
        logger.info(f"Received params: {params}")
        
        # Conversion des paramètres
        for key, value in params.items():
            if value == '':
                params[key] = None
            elif key == 'limit':
                params[key] = int(value) if value is not None else None
            elif key in ['X', 'Y']:
                params[key] = float(value) if value is not None else None
        
        with driver.session(database=NEO4J_DATABASE) as session:
            try:
                result = session.run(cypher, params)
                records = result.data()

                logger.info(f"Raw records count: {len(records)}")

                print(f"Raw records count: {len(records)}")
                
                if query_id in [1, 3]:  # Nœuds
                    formatted_results = [{
                        "id": record.get('id'),
                        "longitude": record.get('longitude'),
                        "latitude": record.get('latitude'),
                        "altitude": record.get('altitude')
                    } for record in records]
                elif query_id == 2:  # Thalwegs
                    formatted_results = []
                    for record in records:
                        geometry = record.get('geometry')
                        coordinates = parse_linestring(geometry)
                        if coordinates:
                            formatted_result = {
                                "id": record.get('id'),
                                "coordinates": coordinates,
                                "accumulation": record.get('accumulation'),
                                "slope": record.get('slope')
                            }
                            formatted_results.append(formatted_result)
                        else:
                            print(f"Warning: Empty coordinates for thalweg {record.get('id')}")

                elif query_id in [4, 5]:  # Thalwegs en amont ou en aval
                    formatted_results = format_upstream_downstream_results(records)
                else:
                    formatted_results = records
                
                print(f"Number of formatted results: {len(formatted_results)}")
                print(f"Sample of formatted results: {formatted_results[:5]}")

                logger.info(f"Number of formatted results: {len(formatted_results)}")
                logger.debug(f"Formatted results: {formatted_results}")
                
                return JsonResponse({"results": formatted_results})
            except Exception as e:
                print(f"Error executing query: {str(e)}")
                logger.error(f"Error executing query: {str(e)}", exc_info=True)
                return JsonResponse({"error": str(e)}, status=500)
    
    return JsonResponse({"error": "Method not allowed"}, status=405)

# Fonction utilitaire pour les logs détaillés (à utiliser pour le débogage si nécessaire)
def log_detailed_results(records):
    print(f"Raw records: {records}")
    for record in records:
        print(f"Record: {record}")
        path = record.get('path')
        if path:
            print(f"Path: {path}")
            print(f"Relationships: {path.relationships}")
            for rel in path.relationships:
                print(f"Relationship: {rel}")
                print(f"Start node: {rel.start_node}")
                print(f"End node: {rel.end_node}")


def format_upstream_downstream_results(records):
    formatted_results = []
    for record in records:
        geometry_key = 'upstreamGeometry' if 'upstreamGeometry' in record else 'downstreamGeometry'
        id_key = 'upstreamId' if 'upstreamId' in record else 'downstreamId'
        coordinates = parse_linestring(record[geometry_key])
        if coordinates:
            formatted_result = {
                id_key: record[id_key],
                "depth": record['depth'],
                "valleyId": record['valleyId'],
                "coordinates": coordinates
            }
            formatted_results.append(formatted_result)
        else:
            logger.warning(f"Empty coordinates for thalweg {record[id_key]}")
    
    logger.info(f"Formatted {len(formatted_results)} thalwegs")
    return formatted_results