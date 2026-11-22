import json
import math
import os
from pathlib import Path
import time
from typing import List, Optional
import urllib.request
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from scipy.stats import linregress

app = FastAPI(title="Pandemic Intelligence OS API", version="2.1.0")

# Compress JSON and static assets (the self-hosted 3D library is ~700 KB raw)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "processed"
STATIC_DIR = Path(__file__).resolve().parent / "static"

print(f"Loading datasets from {DATA_DIR}...")

# Load processed datasets into memory for instantaneous response times
confirmed_df = pd.read_csv(DATA_DIR / "confirmed_cases.csv")
dead_df = pd.read_csv(DATA_DIR / "dead_cases.csv")
daily_change_df = pd.read_csv(DATA_DIR / "confirmed_cases_daily_change.csv")
t0_df = pd.read_csv(DATA_DIR / "confirmed_cases_since_t0.csv")
country_stats_df = pd.read_csv(DATA_DIR / "country_stats.csv")
coords_df = pd.read_csv(DATA_DIR / "coordinates.csv")
ctry_to_cont_df = pd.read_csv(DATA_DIR / "country_to_continent.csv")
world_bank_df = pd.read_csv(DATA_DIR / "world_bank.csv")

# Ensure Date column is string
dates = confirmed_df["Date"].tolist()

# Country columns (exclude Date)
country_cols = [c for c in confirmed_df.columns if c != "Date"]

# Merge coordinates and continents into country stats
master_stats = country_stats_df.copy()
master_stats = master_stats.merge(coords_df, on="Country", how="left")
master_stats = master_stats.merge(ctry_to_cont_df[["Country", "Continent", "Country Code"]], on="Country", how="left")
master_stats["Continent"] = master_stats["Continent"].fillna("Other")
master_stats["Mortality %"] = master_stats["Mortality"]

# Merge World Bank socioeconomic indicators
master_stats = master_stats.merge(
    world_bank_df[[
        "Country", "GDP per capita", "GDP Healthcare %", "Life expectancy",
        "Rural population %", "Cases per mln", "Dead per mln"
    ]],
    on="Country",
    how="left"
)

# Global daily sum
global_confirmed_series = confirmed_df[country_cols].sum(axis=1)
global_dead_series = dead_df[country_cols].sum(axis=1)

# Daily new global cases
global_daily_confirmed = global_confirmed_series.diff().fillna(0).clip(lower=0)
global_daily_dead = global_dead_series.diff().fillna(0).clip(lower=0)
global_daily_confirmed_7d = global_daily_confirmed.rolling(7, min_periods=1).mean().round(1)

print("Datasets cached successfully. API ready!")

def sanitize_json(obj):
    """Recursively replaces NaN, Inf, and numpy data types with clean JSON-safe primitives"""
    if obj is None:
        return None
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, (np.floating, np.integer)):
        val = obj.item()
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        return val
    if isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_json(v) for v in obj]
    return obj

@app.get("/api/overview")
def get_overview():
    total_confirmed = int(master_stats["Confirmed"].sum())
    total_dead = int(master_stats["Dead"].sum())
    mortality_rate = round((total_dead / total_confirmed * 100), 2) if total_confirmed else 0
    
    peak_idx = int(global_daily_confirmed.idxmax())
    peak_date = dates[peak_idx]
    peak_cases = int(global_daily_confirmed.iloc[peak_idx])

    continent_group = master_stats.groupby("Continent").agg({
        "Confirmed": "sum",
        "Dead": "sum",
        "Country": "count"
    }).reset_index().rename(columns={"Country": "Countries"})
    
    continent_group["Mortality"] = (continent_group["Dead"] / continent_group["Confirmed"] * 100).round(2)
    continent_breakdown = continent_group.to_dict(orient="records")

    top_10_confirmed = master_stats.sort_values("Confirmed", ascending=False).head(10)[[
        "Country", "Confirmed", "Dead", "Mortality", "Continent"
    ]].to_dict(orient="records")

    top_10_mortality = master_stats[master_stats["Confirmed"] > 5000].sort_values("Mortality", ascending=False).head(10)[[
        "Country", "Confirmed", "Dead", "Mortality", "Continent"
    ]].to_dict(orient="records")

    return sanitize_json({
        "total_confirmed": total_confirmed,
        "total_dead": total_dead,
        "mortality_rate": mortality_rate,
        "total_countries": len(country_cols),
        "total_days": len(dates),
        "start_date": dates[0],
        "end_date": dates[-1],
        "peak_day": {
            "date": peak_date,
            "cases": peak_cases
        },
        "continents": continent_breakdown,
        "top_confirmed": top_10_confirmed,
        "top_mortality": top_10_mortality
    })

# ==================== LIVE DATA PIPELINE (disease.sh integration) ====================
live_cache = {
    "global": None,
    "global_ts": 0,
    "countries": None,
    "countries_ts": 0
}

def fetch_live_global():
    now = time.time()
    if live_cache["global"] and (now - live_cache["global_ts"] < 300):
        return live_cache["global"]
    try:
        url = "https://disease.sh/v3/covid-19/all"
        req = urllib.request.Request(url, headers={"User-Agent": "Pandemic-Intelligence-OS/2.1"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
            live_cache["global"] = data
            live_cache["global_ts"] = now
            return data
    except Exception as e:
        print(f"Error fetching live global data: {e}")
        return live_cache.get("global")

def fetch_live_countries():
    now = time.time()
    if live_cache["countries"] and (now - live_cache["countries_ts"] < 300):
        return live_cache["countries"]
    try:
        url = "https://disease.sh/v3/covid-19/countries"
        req = urllib.request.Request(url, headers={"User-Agent": "Pandemic-Intelligence-OS/2.1"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            live_cache["countries"] = data
            live_cache["countries_ts"] = now
            return data
    except Exception as e:
        print(f"Error fetching live countries data: {e}")
        return live_cache.get("countries")

@app.get("/api/live/overview")
def get_live_overview():
    data = fetch_live_global()
    if not data:
        raise HTTPException(status_code=503, detail="Live data service currently unreachable")
    return sanitize_json({
        "status": "live",
        "updated": data.get("updated"),
        "total_confirmed": data.get("cases"),
        "total_dead": data.get("deaths"),
        "total_recovered": data.get("recovered"),
        "active_cases": data.get("active"),
        "critical_cases": data.get("critical"),
        "total_tests": data.get("tests"),
        "mortality_rate": round(data.get("deaths", 0) / max(1, data.get("cases", 1)) * 100, 2),
        "total_countries": data.get("affectedCountries"),
        "cases_per_mln": data.get("casesPerOneMillion"),
        "dead_per_mln": data.get("deathsPerOneMillion"),
        "today_cases": data.get("todayCases"),
        "today_deaths": data.get("todayDeaths")
    })

@app.get("/api/live/countries")
def get_live_countries_endpoint():
    data = fetch_live_countries()
    if not data:
        raise HTTPException(status_code=503, detail="Live data service currently unreachable")
    # Format into consistent structure
    formatted = []
    for c in data:
        formatted.append({
            "Country": c.get("country"),
            "Continent": c.get("continent") or "Other",
            "Confirmed": c.get("cases", 0),
            "Dead": c.get("deaths", 0),
            "Mortality": round(c.get("deaths", 0) / max(1, c.get("cases", 1)) * 100, 2),
            "Cases per mln": c.get("casesPerOneMillion"),
            "Dead per mln": c.get("deathsPerOneMillion"),
            "Active": c.get("active", 0),
            "Tests": c.get("tests", 0),
            "Population": c.get("population", 0),
            "Flag": c.get("countryInfo", {}).get("flag")
        })
    return sanitize_json(formatted)

@app.get("/api/live/country/{name}")
def get_live_country_endpoint(name: str):
    data = fetch_live_countries()
    if not data:
        raise HTTPException(status_code=503, detail="Live data service currently unreachable")
    target = name.strip().lower()
    for c in data:
        c_name = c.get("country", "").lower()
        iso2 = (c.get("countryInfo", {}).get("iso2") or "").lower()
        iso3 = (c.get("countryInfo", {}).get("iso3") or "").lower()
        if target in (c_name, iso2, iso3):
            return sanitize_json({
                "country": c.get("country"),
                "continent": c.get("continent"),
                "cases": c.get("cases"),
                "todayCases": c.get("todayCases"),
                "deaths": c.get("deaths"),
                "todayDeaths": c.get("todayDeaths"),
                "recovered": c.get("recovered"),
                "active": c.get("active"),
                "critical": c.get("critical"),
                "casesPerOneMillion": c.get("casesPerOneMillion"),
                "deathsPerOneMillion": c.get("deathsPerOneMillion"),
                "tests": c.get("tests"),
                "population": c.get("population"),
                "flag": c.get("countryInfo", {}).get("flag")
            })
    raise HTTPException(status_code=404, detail=f"Live country '{name}' not found")

@app.get("/api/timeline")
def get_timeline(sample_rate: int = Query(1, ge=1, le=14)):
    sub_indices = list(range(0, len(dates), sample_rate))
    if sub_indices[-1] != len(dates) - 1:
        sub_indices.append(len(dates) - 1)

    return sanitize_json({
        "dates": [dates[i] for i in sub_indices],
        "confirmed": [int(global_confirmed_series.iloc[i]) for i in sub_indices],
        "deaths": [int(global_dead_series.iloc[i]) for i in sub_indices],
        "dead": [int(global_dead_series.iloc[i]) for i in sub_indices],
        "daily_confirmed": [int(global_daily_confirmed.iloc[i]) for i in sub_indices],
        "daily_deaths": [int(global_daily_dead.iloc[i]) for i in sub_indices],
        "daily_confirmed_7d": [float(global_daily_confirmed_7d.iloc[i]) for i in sub_indices]
    })

@app.get("/api/countries")
def get_countries(continent: Optional[str] = None):
    df = master_stats.copy()
    if continent and continent.lower() != "all":
        df = df[df["Continent"].str.lower() == continent.lower()]

    df = df.sort_values("Confirmed", ascending=False)
    records = df.to_dict(orient="records")
    return sanitize_json(records)

@app.get("/api/map")
def get_map_data():
    df = master_stats.dropna(subset=["Lat", "Long"]).copy()
    result = []
    for _, row in df.iterrows():
        result.append({
            "country": row["Country"],
            "lat": float(row["Lat"]),
            "lng": float(row["Long"]),
            "continent": str(row["Continent"]),
            "confirmed": int(row["Confirmed"]),
            "dead": int(row["Dead"]),
            "mortality": float(row["Mortality"]),
            "cases_per_mln": float(row["Cases per mln"]) if pd.notnull(row["Cases per mln"]) else None,
            "dead_per_mln": float(row["Dead per mln"]) if pd.notnull(row["Dead per mln"]) else None,
            "gdp_pc": float(row["GDP per capita"]) if pd.notnull(row["GDP per capita"]) else None
        })
    return sanitize_json(result)

@app.get("/api/country/{name}")
def get_country_detail(name: str):
    matched = master_stats[master_stats["Country"].str.lower() == name.lower()]
    if matched.empty:
        raise HTTPException(status_code=404, detail=f"Country '{name}' not found")

    row = matched.iloc[0]
    actual_name = row["Country"]

    ctry_conf = confirmed_df[actual_name].tolist() if actual_name in confirmed_df else []
    ctry_dead = dead_df[actual_name].tolist() if actual_name in dead_df else []
    ctry_daily = [0] + [ctry_conf[i] - ctry_conf[i-1] for i in range(1, len(ctry_conf))]
    ctry_daily_smoothed = pd.Series(ctry_daily).rolling(7, min_periods=1).mean().round(1).tolist()

    rank_conf = int((master_stats["Confirmed"] > row["Confirmed"]).sum() + 1)
    rank_dead = int((master_stats["Dead"] > row["Dead"]).sum() + 1)
    valid_mort = master_stats[master_stats["Confirmed"] > 5000]
    rank_mort = int((valid_mort["Mortality"] > row["Mortality"]).sum() + 1)

    return sanitize_json({
        "stats": {
            "country": actual_name,
            "continent": row["Continent"],
            "country_code": row["Country Code"],
            "confirmed": int(row["Confirmed"]),
            "dead": int(row["Dead"]),
            "mortality": float(row["Mortality"]),
            "rank_confirmed": rank_conf,
            "rank_dead": rank_dead,
            "rank_mortality": rank_mort,
            "gdp_per_capita": float(row["GDP per capita"]) if pd.notnull(row["GDP per capita"]) else None,
            "health_gdp_pct": float(row["GDP Healthcare %"]) if pd.notnull(row["GDP Healthcare %"]) else None,
            "life_expectancy": float(row["Life expectancy"]) if pd.notnull(row["Life expectancy"]) else None,
            "rural_pct": float(row["Rural population %"]) if pd.notnull(row["Rural population %"]) else None,
            "cases_per_mln": float(row["Cases per mln"]) if pd.notnull(row["Cases per mln"]) else None,
            "dead_per_mln": float(row["Dead per mln"]) if pd.notnull(row["Dead per mln"]) else None
        },
        "timeline": {
            "dates": dates[::2],
            "confirmed": ctry_conf[::2],
            "dead": ctry_dead[::2],
            "daily_confirmed": ctry_daily[::2],
            "daily_confirmed_7d": ctry_daily_smoothed[::2]
        }
    })

def parse_country_names(names: str, available_cols: List[str]) -> List[str]:
    """Parse country names allowing pipes '|' or commas, correctly handling country names with commas (e.g. 'Korea, South')"""
    if not names:
        return []
    lower_map = {col.lower(): col for col in available_cols}
    if "|" in names:
        raw_list = [c.strip() for c in names.split("|") if c.strip()]
    else:
        parts = [p.strip() for p in names.split(",") if p.strip()]
        raw_list = []
        i = 0
        while i < len(parts):
            if i + 1 < len(parts):
                combined = f"{parts[i]}, {parts[i+1]}".lower()
                if combined in lower_map:
                    raw_list.append(lower_map[combined])
                    i += 2
                    continue
            raw_list.append(parts[i])
            i += 1

    result = []
    for c in raw_list:
        matched = lower_map.get(c.lower())
        if matched and matched not in result:
            result.append(matched)
    return result

@app.get("/api/compare")
def compare_countries(names: str = Query("US,India,Brazil,France")):
    country_list = parse_country_names(names, country_cols)
    series_data = {}

    for col_name in country_list:
        conf = confirmed_df[col_name].tolist()
        series_data[col_name] = {
            "confirmed": conf[::2],
            "deaths": dead_df[col_name].tolist()[::2],
            "daily_7d": pd.Series(conf).diff().fillna(0).clip(lower=0).rolling(7, min_periods=1).mean().round(1).tolist()[::2]
        }

    return sanitize_json({
        "dates": dates[::2],
        "series": series_data
    })

@app.get("/api/t0")
def get_t0_comparison(names: str = Query("US,India,Brazil,United Kingdom,Italy,Germany")):
    country_list = parse_country_names(names, list(t0_df.columns))
    t0_data = {}

    for col_name in country_list:
        vals = t0_df[col_name].dropna().tolist()
        t0_data[col_name] = vals

    max_len = max([len(v) for v in t0_data.values()]) if t0_data else 0
    days_axis = list(range(max_len))

    return sanitize_json({
        "days": days_axis,
        "series": t0_data
    })

@app.get("/api/socioeconomic")
def get_socioeconomic_correlation(x_indicator: str = "GDP per capita", y_indicator: str = "Mortality %"):
    valid_cols = {
        "GDP per capita": "GDP per capita",
        "GDP Healthcare %": "GDP Healthcare %",
        "Life expectancy": "Life expectancy",
        "Rural population %": "Rural population %",
        "Cases per mln": "Cases per mln",
        "Dead per mln": "Dead per mln",
        "Mortality %": "Mortality %"
    }

    x_col = valid_cols.get(x_indicator, "GDP per capita")
    y_col = valid_cols.get(y_indicator, "Mortality %")

    cols_to_pull = ["Country", "Continent", "Confirmed", x_col, y_col]
    df = master_stats[cols_to_pull].dropna().copy()
    df = df[df["Country"] != "Yemen"]
    df = df[df["Confirmed"] > 5000]

    # Keep finite only
    df = df[np.isfinite(df[x_col]) & np.isfinite(df[y_col])]

    x_vals = df[x_col].values.astype(float)
    y_vals = df[y_col].values.astype(float)

    if len(x_vals) > 2 and np.std(x_vals) > 0 and np.std(y_vals) > 0:
        slope, intercept, r_val, p_val, std_err = linregress(x_vals, y_vals)
        if math.isnan(slope) or math.isinf(slope):
            slope, intercept, r_val, p_val = 0.0, 0.0, 0.0, 1.0
    else:
        slope, intercept, r_val, p_val = 0.0, 0.0, 0.0, 1.0

    points = []
    for _, row in df.iterrows():
        points.append({
            "country": row["Country"],
            "continent": row["Continent"],
            "x": float(row[x_col]),
            "y": float(row[y_col]),
            "confirmed": int(row["Confirmed"])
        })

    return sanitize_json({
        "x_label": x_col,
        "y_label": y_col,
        "correlation_r": round(float(r_val), 3),
        "r_squared": round(float(r_val ** 2), 3),
        "p_value": float(f"{p_val:.2e}") if p_val > 0 else 0.0,
        "slope": round(float(slope), 6),
        "intercept": round(float(intercept), 4),
        "points": points
    })

@app.get("/api/simulate-sir")
def simulate_sir(
    population: int = Query(1000000, ge=10000, le=1000000000),
    r0: float = Query(2.5, ge=0.5, le=10.0),
    infectious_days: float = Query(10.0, ge=1.0, le=30.0),
    simulation_days: int = Query(180, ge=30, le=500),
    lockdown_day: int = Query(45, ge=0, le=300),
    lockdown_reduction: float = Query(50.0, ge=0.0, le=95.0)
):
    gamma = 1.0 / infectious_days
    base_beta = r0 * gamma

    S = float(population - 10)
    I = 10.0
    R = 0.0
    N = float(population)

    history_s = [round(S)]
    history_i = [round(I)]
    history_r = [round(R)]
    days = [0]

    peak_infected = I
    peak_day = 0

    dt = 0.5
    steps = int(simulation_days / dt)

    current_t = 0.0
    for step in range(1, steps + 1):
        current_t += dt
        
        if current_t >= lockdown_day and lockdown_day > 0:
            beta = base_beta * (1.0 - lockdown_reduction / 100.0)
        else:
            beta = base_beta

        dS = - (beta * S * I / N) * dt
        dI = ((beta * S * I / N) - (gamma * I)) * dt
        dR = (gamma * I) * dt

        S = max(0.0, S + dS)
        I = max(0.0, I + dI)
        R = min(N, R + dR)

        if I > peak_infected:
            peak_infected = I
            peak_day = int(current_t)

        if step % 2 == 0:
            days.append(int(current_t))
            history_s.append(round(S))
            history_i.append(round(I))
            history_r.append(round(R))

    return sanitize_json({
        "parameters": {
            "population": population,
            "r0": r0,
            "effective_r0_after_lockdown": round(r0 * (1 - lockdown_reduction / 100), 2) if lockdown_day > 0 else r0,
            "infectious_days": infectious_days,
            "simulation_days": simulation_days,
            "lockdown_day": lockdown_day,
            "lockdown_reduction": lockdown_reduction
        },
        "summary": {
            "peak_infected": int(peak_infected),
            "peak_infected_pct": round(peak_infected / N * 100, 2),
            "peak_day": peak_day,
            "total_attack_rate_pct": round((N - S) / N * 100, 1)
        },
        "trajectory": {
            "days": days,
            "susceptible": history_s,
            "infected": history_i,
            "recovered": history_r
        }
    })

os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def read_root():
    return FileResponse(STATIC_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
