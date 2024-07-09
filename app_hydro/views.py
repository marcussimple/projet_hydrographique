from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from neo4j import GraphDatabase
import re

# Configurez votre connexion Neo4j ici
NEO4J_URI = "bolt://localhost:7687"  # Remplacez par votre URI Neo4j
NEO4J_USER = "neo4j"  # Remplacez par votre nom d'utilisateur Neo4j
NEO4J_PASSWORD = "password"  # Remplacez par votre mot de passe Neo4j
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
                if 'limit' in params:
                    params['limit'] = int(params['limit'])
                
                result = session.run(cypher, params)
                records = [record.data() for record in result]
                
                if query_id == 1:  # Nœuds
                    formatted_results = [{
                        "id": record.get('id'),
                        "longitude": record.get('longitude'),
                        "latitude": record.get('latitude')
                    } for record in records]
                elif query_id == 2:  # Thalwegs
                    formatted_results = []
                    for record in records:
                        geometry = record.get('geometry')
                        coordinates = parse_linestring(geometry)
                        formatted_results.append({
                            "id": record.get('id'),
                            "coordinates": coordinates,
                            "accumulation": record.get('accumulation')
                        })
                else:
                    formatted_results = records
                
                print(f"Number of results: {len(formatted_results)}")
                
                return JsonResponse({"results": formatted_results})
            except Exception as e:
                print(f"Error executing query: {str(e)}")
                return JsonResponse({"error": str(e)}, status=500)
    
    return JsonResponse({"error": "Method not allowed"}, status=405)