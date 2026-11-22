import os
import io
import zipfile
from pathlib import Path
from time import sleep
import pandas as pd
import requests
import wbdata

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def download_covid():
    """
    Download COVID-19 case data directly from CSSE repository on GitHub.
    """
    base_url = 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series'
    target_dir = PROJECT_ROOT / 'data' / 'raw' / 'COVID-19' / 'csse_covid_19_data' / 'csse_covid_19_time_series'
    target_dir.mkdir(parents=True, exist_ok=True)

    files = [
        'time_series_covid19_confirmed_global.csv',
        'time_series_covid19_recovered_global.csv',
        'time_series_covid19_deaths_global.csv'
    ]

    for fname in files:
        full_path = target_dir / fname
        url = f'{base_url}/{fname}'
        print(f'Downloading {fname}...')
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        with open(full_path, 'wb') as f:
            f.write(resp.content)
        print(f'Saved {full_path}')

def download_countries():
    """
    Download countries csv with ISO codes and continent mapping.
    """
    url = 'https://gist.githubusercontent.com/stevewithington/20a69c0b6d2ff846ea5d35e5fc47f26c/raw/country-and-continent-codes-list-csv.csv'
    target_dir = PROJECT_ROOT / 'data' / 'raw' / 'datahub'
    target_dir.mkdir(parents=True, exist_ok=True)

    print('Downloading country codes and continent mapping...')
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    full_path = target_dir / 'countries.csv'
    with open(full_path, 'wb') as f:
        f.write(resp.content)
    print(f'Saved {full_path}')

def download_world_bank():
    """
    Download data from the World Bank and generate codes mapping.
    Uses direct World Bank bulk CSV downloads for high reliability.
    """
    target_dir = PROJECT_ROOT / 'data' / 'raw' / 'world_bank'
    processed_dir = PROJECT_ROOT / 'data' / 'processed'
    target_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)

    indicators = [
        ('NY.GDP.PCAP.PP.CD', 'GDP per capita, PPP (current international $)'),
        ('SP.POP.TOTL', 'Population, total'),
        ('SP.URB.TOTL.IN.ZS', 'Urban population (% of total population)'),
        ('EN.POP.SLUM.UR.ZS', 'Population living in slums (% of urban population)'),
        ('SP.RUR.TOTL.ZS', 'Rural population (% of total population)'),
        ('SP.DYN.LE00.IN', 'Life expectancy at birth, total (years)'),
        ('SH.XPD.CHEX.GD.ZS', 'Current health expenditure (% of GDP)')
    ]

    print('Downloading World Bank indicator data...')
    for code, label in indicators:
        full_path = target_dir / f'{code}.csv'
        print(f'Downloading {code} ({label})...')
        url = f'http://api.worldbank.org/v2/en/indicator/{code}?downloadformat=csv'
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                csv_files = [n for n in z.namelist() if n.startswith('API_')]
                if not csv_files:
                    raise ValueError(f'No API CSV found in zip for {code}')
                raw_df = pd.read_csv(z.open(csv_files[0]), skiprows=4)
                year_cols = [c for c in raw_df.columns if c.isdigit()]
                melted = raw_df.melt(
                    id_vars=['Country Name'],
                    value_vars=year_cols,
                    var_name='date',
                    value_name=label
                ).rename(columns={'Country Name': 'country'})
                melted.to_csv(full_path, index=False)
                print(f'Saved {full_path}')
        except Exception as e:
            print(f'Download failed for {code}: {e}')

    print('Generating world_bank_codes.csv...')
    try:
        countries = wbdata.get_countries()
        codes_df = pd.DataFrame([{'Country Name': c['name'], 'Country Code': c['id']} for c in countries])
        codes_path = processed_dir / 'world_bank_codes.csv'
        codes_df.to_csv(codes_path, index=False)
        print(f'Saved {codes_path}')
    except Exception as e:
        print(f'Failed to generate world_bank_codes.csv: {e}')

if __name__ == '__main__':
    download_covid()
    download_countries()
    download_world_bank()
