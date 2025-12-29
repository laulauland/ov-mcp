# ov-mcp

**GTFS Data Parsing and Journey Planning for Netherlands Public Transport**

This project provides tools for parsing GTFS (General Transit Feed Specification) data from the Netherlands public transport API (gtfs.ovapi.nl) and demonstrates journey planning capabilities with a focus on metro connectivity in Amsterdam.

## Features

- 📦 **GTFS Data Parser**: Download and parse GTFS feeds from gtfs.ovapi.nl
- 🚇 **Metro Route Finding**: Specialized logic for finding metro connections
- 🗺️ **Journey Planning**: Find journey options between stations with transfers
- 🔍 **Stop Search**: Fuzzy matching for finding stations by name
- 📊 **Production-Ready**: Comprehensive error handling, logging, and data validation

## Project Structure

```
ov-mcp/
├── README.md                          # Project documentation
├── requirements.txt                   # Python dependencies
└── explorations/
    ├── gtfs_parser.py                # GTFS data parsing utilities
    ├── journey_planner.py            # Journey planning logic
    └── find_metro_route.py           # Demo: Amsterdam Noorderpark to Zuid
```

## Installation

1. **Clone the repository:**

```bash
git clone https://github.com/laulauland/ov-mcp.git
cd ov-mcp
```

2. **Create a virtual environment (recommended):**

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies:**

```bash
pip install -r requirements.txt
```

## Usage

### Quick Start: Find Metro Route from Noorderpark to Amsterdam Zuid

```bash
python explorations/find_metro_route.py
```

This demo script will:
1. Download and parse the latest GTFS data from gtfs.ovapi.nl
2. Find stations matching "Amsterdam Noorderpark" and "Amsterdam Zuid"
3. Search for journey options with up to 2 transfers
4. Display metro-specific routes and general journey options
5. Cache the GTFS data locally for faster subsequent runs

### Using the GTFS Parser

```python
from explorations.gtfs_parser import GTFSParser

# Initialize parser and load data
parser = GTFSParser()
gtfs_data = parser.load_gtfs_data()

# Access parsed data
stops = gtfs_data['stops']           # All stops/stations
routes = gtfs_data['routes']         # All routes
trips = gtfs_data['trips']           # All trips
stop_times = gtfs_data['stop_times'] # Stop times for each trip

# Find a specific stop
from explorations.journey_planner import find_stops_by_name
noorderpark = find_stops_by_name(stops, "Amsterdam Noorderpark")
print(f"Found: {noorderpark[0]['stop_name']}")
```

### Using the Journey Planner

```python
from explorations.journey_planner import JourneyPlanner

planner = JourneyPlanner(gtfs_data)

# Find journey options
journeys = planner.find_journeys(
    origin_stop_id="stop_id_1",
    destination_stop_id="stop_id_2",
    max_transfers=2
)

# Filter for metro-only journeys
metro_journeys = [
    j for j in journeys 
    if all(leg['route_type'] == 1 for leg in j['legs'])
]

for journey in metro_journeys:
    print(f"Journey with {journey['num_transfers']} transfers")
    for leg in journey['legs']:
        print(f"  {leg['route_short_name']}: {leg['from_stop']} -> {leg['to_stop']}")
```

## GTFS Data

The project uses GTFS data from **gtfs.ovapi.nl**, which provides comprehensive public transport data for the Netherlands.

### GTFS Files Used:

- **stops.txt**: All stations and stops with locations
- **routes.txt**: Transit routes (metro, bus, tram, train, etc.)
- **trips.txt**: Individual trips on routes
- **stop_times.txt**: Arrival/departure times at each stop

### Route Types:

- `0` - Tram, Streetcar, Light rail
- `1` - **Metro** (Subway)
- `2` - Rail (intercity, regional)
- `3` - Bus
- `4` - Ferry
- `5` - Cable car
- `6` - Gondola, Suspended cable car
- `7` - Funicular

## Key Components

### GTFSParser (`explorations/gtfs_parser.py`)

Handles downloading and parsing GTFS data:

- Downloads gtfs-nl.zip from gtfs.ovapi.nl
- Caches data locally to avoid repeated downloads
- Parses CSV files into structured dictionaries
- Validates data integrity
- Provides logging for troubleshooting

### JourneyPlanner (`explorations/journey_planner.py`)

Implements journey planning logic:

- Builds a network graph from GTFS data
- Finds direct connections between stations
- Searches for multi-leg journeys with transfers
- Supports filtering by route type (e.g., metro-only)
- Fuzzy stop name matching

### Demo Script (`explorations/find_metro_route.py`)

Demonstrates practical usage:

- End-to-end example of finding routes
- Shows metro-specific filtering
- Displays journey details in a readable format
- Handles common error cases

## Error Handling

The project includes comprehensive error handling:

- Network errors when downloading GTFS data
- File parsing errors for malformed CSV data
- Missing or invalid stop IDs
- Empty search results
- Data validation errors

All errors are logged with appropriate context for debugging.

## Logging

Logging is configured at INFO level by default. To see more detailed logs:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Development

### Running Tests

```bash
# Add your test commands here
python -m pytest tests/
```

### Code Style

The project follows PEP 8 guidelines. Format code with:

```bash
black explorations/
```

## Use Cases

1. **Metro Connectivity Analysis**: Analyze metro connections between areas
2. **Journey Planning**: Build a journey planner application
3. **Transit Data Analysis**: Study public transport patterns
4. **Route Optimization**: Find optimal routes with minimal transfers
5. **Accessibility Research**: Study station connectivity and accessibility

## Amsterdam Metro Network

Amsterdam has 5 metro lines:

- **M50** (Gein - Isolatorweg)
- **M51** (Centraal Station - Isolatorweg/AMC)
- **M52** (Noord - Zuid)
- **M53** (Gaasperplas - Centraal Station)
- **M54** (Gein - Centraal Station)

**Amsterdam Zuid** is a major interchange station served by multiple metro lines, making it a key destination for journey planning.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- **gtfs.ovapi.nl** for providing comprehensive GTFS data
- **OpenOV** for maintaining Netherlands public transport data
- The GTFS community for the standardized data format

## Contact

Laurynas Keturakis
- GitHub: [@laulauland](https://github.com/laulauland)
- Email: hi@laurynas.cc
- Website: laurynas.cc

---

**Note**: This project is for educational and research purposes. For production journey planning, consider using official APIs or services.
