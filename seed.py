import pymongo
import random
from datetime import datetime, timedelta

# ==========================================
# CONFIGURAZIONE MICROSERVIZI
# ==========================================
# Connessione al DB dei Twin (Lettura)
TWIN_MONGO_URI = "mongodb://localhost:27017/"
TWIN_DB_NAME = "twindb"
BUILDINGS_COLLECTION = "buildings"  # Modifica se la collection si chiama "twins" o altro

# Connessione al DB dei Sensori (Scrittura)
SENSOR_MONGO_URI = "mongodb://localhost:27018/"  # Nota: porta 27018!
SENSOR_DB_NAME = "sensordb"
PEOPLE_COLLECTION = "peoplecounts"      
TEMP_COLLECTION = "temperatures"        

DAYS_TO_GENERATE = 30
# ==========================================

def get_occupancy(hour):
    if hour < 7 or hour > 20: return 0
    elif 9 <= hour <= 17: return random.randint(20, 50)
    else: return random.randint(5, 15)

def get_temperature(hour, occupancy):
    base_temp = 22.0 if 8 <= hour <= 19 else 18.0
    temp = base_temp + (occupancy * 0.05) + random.uniform(-1.0, 1.0)
    return round(temp, 1)

def main():
    print("Connessione ai microservizi MongoDB...")
    
    # Inizializza i due client separati
    try:
        twin_client = pymongo.MongoClient(TWIN_MONGO_URI, serverSelectionTimeoutMS=5000)
        sensor_client = pymongo.MongoClient(SENSOR_MONGO_URI, serverSelectionTimeoutMS=5000)
        
        # Test connessione
        twin_client.server_info()
        sensor_client.server_info()
    except Exception as e:
        print(f"Errore di connessione! Assicurati di aver esposto le porte su localhost. Dettagli:\n{e}")
        return

    twin_db = twin_client[TWIN_DB_NAME]
    sensor_db = sensor_client[SENSOR_DB_NAME]
    
    # 1. Recupera gli edifici dinamicamente dal Twin DB
    print(f"Lettura edifici dal database '{TWIN_DB_NAME}'...")
    buildings = list(twin_db[BUILDINGS_COLLECTION].find({}))
    
    if not buildings:
        print(f"Nessun edificio trovato nella collection '{BUILDINGS_COLLECTION}'! Esco.")
        return

    print(f"Trovati {len(buildings)} edifici. Generazione dati in corso...")
    
    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    people_data = []
    temp_data = []

    # 2. Genera i dati
    for day_offset in range(DAYS_TO_GENERATE, -1, -1):
        for hour in range(24):
            target_date = now - timedelta(days=day_offset)
            target_date = target_date.replace(hour=hour)

            if target_date > now:
                continue

            # In timestamp TypeScript (millisecondi)
            timestamp_ms = int(target_date.timestamp() * 1000)

            for building in buildings:
                b_id = str(building.get('id', building.get('_id', '')))
                if not b_id:
                    continue
                    
                rooms = building.get('rooms', [])
                for room in rooms:
                    if isinstance(room, dict):
                        r_id = str(room.get('id', room.get('_id', '')))
                    else:
                        r_id = str(room)
                        
                    if not r_id:
                        continue

                    occupancy = get_occupancy(hour)
                    temperature = get_temperature(hour, occupancy)

                    people_data.append({
                        "twin": b_id,
                        "roomId": r_id,
                        "timestamp": timestamp_ms,
                        "peopleCount": occupancy
                    })

                    temp_data.append({
                        "twin": b_id,
                        "roomId": r_id,
                        "timestamp": timestamp_ms,
                        "temperature": temperature
                    })

    # 3. Inserimento massivo nel Sensor DB
    if people_data and temp_data:
        print(f"Scrittura nel database '{SENSOR_DB_NAME}'...")
        
        # db[PEOPLE_COLLECTION].delete_many({}) # Decommenta per pulire i vecchi dati
        sensor_db[PEOPLE_COLLECTION].insert_many(people_data)
        print(f"✅ Inseriti {len(people_data)} record in '{PEOPLE_COLLECTION}'.")
        
        # db[TEMP_COLLECTION].delete_many({}) # Decommenta per pulire i vecchi dati
        sensor_db[TEMP_COLLECTION].insert_many(temp_data)
        print(f"✅ Inseriti {len(temp_data)} record in '{TEMP_COLLECTION}'.")
        
        print("Tutto pronto! I grafici dovrebbero esplodere di dati ora. 🎉")
    else:
        print("Nessun dato generato.")

if __name__ == "__main__":
    main()