from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from neo4j import GraphDatabase
import re

# Configuration de la connexion Neo4j
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "password"  # Remplacez par votre mot de passe réel
NEO4J_DATABASE = "hydronetwork"

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

def index(request):
    return render(request, 'index.html')

def parse_linestring(geometry_string):
    coordinates_match = re.search(r'LINESTRING Z \((.*?)\)', geometry_string)
    if coordinates_match:
        coordinates_str = coordinates_match.group(1)
        points = coordinates_str.split(', ')
        return [[float(point.split()[0]), float(point.split()[1])] for point in points]
    return []

@csrf_exempt
def execute_query(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        cypher = data.get('cypher', '')
        query_id = data.get('queryId')
        params = data.get('params', {})
        
        print(f"Received query: {cypher}")
        print(f"Received params: {params}")
        
        with driver.session(database=NEO4J_DATABASE) as session:
            try:
                # Convertir les paramètres en types appropriés
                for key, value in params.items():
                    if value == '':
                        params[key] = None
                    elif key == 'limit':
                        params[key] = int(value) if value is not None else None
                    elif key in ['X', 'Y']:
                        params[key] = float(value) if value is not None else None
                
                result = session.run(cypher, params)
                records = result.data()
                
                if query_id in [1, 3]:  # Nœuds
                    formatted_results = [{
                        "id": record.get('id'),
                        "longitude": record.get('longitude'),
                        "latitude": record.get('latitude'),
                        "altitude": record.get('altitude')  # Ajouté pour la requête 3
                    } for record in records]
                elif query_id == 2:  # Thalwegs
                    formatted_results = []
                    for record in records:
                        geometry = record.get('geometry')
                        coordinates = parse_linestring(geometry)
                        formatted_result = {
                            "id": record.get('id'),
                            "coordinates": coordinates,
                            "accumulation": record.get('accumulation')
                        }
                        formatted_results.append(formatted_result)
                        print(f"Formatted thalweg: {formatted_result}")
                else:
                    formatted_results = records
                
                print(f"Number of results: {len(formatted_results)}")
                print(f"Sample of formatted results: {formatted_results[:5]}")
                
                return JsonResponse({"results": formatted_results})
            except Exception as e:
                print(f"Error executing query: {str(e)}")
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