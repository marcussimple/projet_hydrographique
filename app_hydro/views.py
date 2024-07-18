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
NEO4J_PASSWORD = "summer2024"  # Remplacez par votre mot de passe réel
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
        geometry_key = 'upstreamGeometry' if 'upstreamGeometry' in record else 'downstreamGeometry'
        id_key = 'upstreamId' if 'upstreamId' in record else 'downstreamId'
        thalweg_coordinates = parse_linestring(record[geometry_key])
        
        if thalweg_coordinates:
            formatted_result = {
                id_key: record[id_key],
                "depth": record['depth'],
                "valleyId": record['valleyId'],
                "coordinates": thalweg_coordinates,
                "ridges": []
            }
            
            # Traitement des ridges
            if 'ridgeGeometries' in record and 'surroundingRidges' in record:
                for ridge_id, ridge_geometry in zip(record['surroundingRidges'], record['ridgeGeometries']):
                    ridge_coordinates = parse_linestring(ridge_geometry)
                    if ridge_coordinates:
                        formatted_result["ridges"].append({
                            "id": ridge_id,
                            "coordinates": ridge_coordinates
                        })
            
            formatted_results.append(formatted_result)
        else:
            logger.warning(f"Empty coordinates for thalweg {record[id_key]}")
    
    logger.info(f"Formatted {len(formatted_results)} thalwegs with their ridges")
    return formatted_results


@csrf_exempt
def execute_query(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        cypher = data.get('cypher', '')
        query_id = data.get('queryId')
        params = data.get('params', {})
        
        logger.info(f"Received query: {cypher}")
        logger.info(f"Received params: {params}")
        
        with driver.session(database=NEO4J_DATABASE) as session:
            try:
                result = session.run(cypher, params)
                records = result.data()

                logger.info(f"Raw records count: {len(records)}")
                logger.debug(f"First few records: {records[:5]}")

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
                            logger.warning(f"Empty coordinates for thalweg {record.get('id')}")
                elif query_id in [4, 5, 6]:  # Thalwegs en amont, en aval, ou crêtes
                    formatted_results = format_upstream_downstream_results(records)
                else:
                    formatted_results = records
                
                logger.info(f"Number of formatted results: {len(formatted_results)}")
                logger.debug(f"Sample of formatted results: {formatted_results[:5]}")
                
                return JsonResponse({"results": formatted_results})
            except Exception as e:
                logger.error(f"Error executing query: {str(e)}", exc_info=True)
                return JsonResponse({"error": str(e)}, status=500)
    
    return JsonResponse({"error": "Method not allowed"}, status=405)

@csrf_exempt
def get_thalweg_info(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        thalweg_id = data.get('thalwegId')
        
        with driver.session(database=NEO4J_DATABASE) as session:
            result = session.run("MATCH (t:Thalweg {id: $id}) RETURN t", id=thalweg_id)
            thalweg = result.single()
            
            if thalweg:
                thalweg_info = thalweg['t']
                coordinates = parse_linestring(thalweg_info['geometry'])
                return JsonResponse({
                    "id": thalweg_info['id'],
                    "accumulation": thalweg_info['accumulation'],
                    "slope": thalweg_info['slope'],
                    "coordinates": coordinates
                })
            else:
                return JsonResponse({"error": "Thalweg not found"}, status=404)

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
        thalweg_coordinates = parse_linestring(record[geometry_key])
        
        if thalweg_coordinates:
            formatted_result = {
                id_key: record[id_key],
                "depth": record['depth'],
                "valleyId": record['valleyId'],
                "coordinates": thalweg_coordinates,
                "ridges": []
            }
            
            # Traitement des ridges
            if 'ridgeGeometries' in record and 'surroundingRidges' in record:
                for ridge_id, ridge_geometry in zip(record['surroundingRidges'], record['ridgeGeometries']):
                    ridge_coordinates = parse_linestring(ridge_geometry)
                    if ridge_coordinates:
                        formatted_result["ridges"].append({
                            "id": ridge_id,
                            "coordinates": ridge_coordinates
                        })
            
            formatted_results.append(formatted_result)
        else:
            logger.warning(f"Empty coordinates for thalweg {record[id_key]}")
    
    logger.info(f"Formatted {len(formatted_results)} thalwegs with their ridges")
    return formatted_results