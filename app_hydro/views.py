from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from neo4j import GraphDatabase

# Configurez votre connexion Neo4j ici
NEO4J_URI = "bolt://localhost:7687"  # Remplacez par votre URI Neo4j
NEO4J_USER = "neo4j"  # Remplacez par votre nom d'utilisateur Neo4j
NEO4J_PASSWORD = "password"  # Remplacez par votre mot de passe Neo4j
NEO4J_DATABASE = "hydronetwork"

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

def index(request):
    return render(request, 'index.html')

@csrf_exempt
def execute_query(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        cypher = data.get('cypher', '')
        query_id = data.get('queryId')
        params = data.get('params', {})
        
        print(f"Received query: {cypher}")  # Ajoutez cette ligne pour le débogage
        print(f"Received params: {params}")  # Ajoutez cette ligne pour le débogage
        
        with driver.session() as session:
            try:
                # Assurez-vous que les paramètres sont du bon type
                if 'limit' in params:
                    params['limit'] = int(params['limit'])
                
                result = session.run(cypher, params)
                records = [record.data() for record in result]
                
                # Formater les résultats en fonction du type de requête
                if query_id in [1, 3]:  # Nœuds simples
                    formatted_results = [{
                        "id": record.get('id'),
                        "longitude": record.get('longitude'),
                        "latitude": record.get('latitude')
                    } for record in records]
                elif query_id == 2:  # Thalwegs
                    formatted_results = [{
                        "id1": record.get('id1'),
                        "long1": record.get('long1'),
                        "lat1": record.get('lat1'),
                        "id2": record.get('id2'),
                        "long2": record.get('long2'),
                        "lat2": record.get('lat2')
                    } for record in records]
                else:
                    formatted_results = records  # Retourner les résultats bruts pour les autres types de requêtes
                
                print(f"Number of results: {len(formatted_results)}")  # Ajoutez cette ligne pour le débogage
                
                return JsonResponse({"results": formatted_results})
            except Exception as e:
                print(f"Error executing query: {str(e)}")  # Ajoutez cette ligne pour le débogage
                return JsonResponse({"error": str(e)}, status=500)
    
    return JsonResponse({"error": "Method not allowed"}, status=405)