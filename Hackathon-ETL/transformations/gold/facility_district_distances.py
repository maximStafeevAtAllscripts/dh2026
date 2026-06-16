from pyspark import pipelines as dp
from pyspark.sql import functions as F

@dp.temporary_view()
def district_centers():
    """Calculate district center coordinates as the centroid of all valid post office locations"""
    return (
        spark.read.table("workspace.raw_data.india_post_pincode_directory")
        .filter(
            (F.col("latitude").isNotNull()) & 
            (F.col("latitude") != "NA") &
            (F.col("longitude").isNotNull()) & 
            (F.col("longitude") != "NA")
        )
        .withColumn("latitude_num", F.col("latitude").cast("double"))
        .withColumn("longitude_num", F.col("longitude").cast("double"))
        .filter(F.col("latitude_num").isNotNull() & F.col("longitude_num").isNotNull())
        .groupBy("district", "statename")
        .agg(
            F.avg("latitude_num").alias("center_latitude"),
            F.avg("longitude_num").alias("center_longitude"),
            F.count("*").alias("office_count")
        )
        .filter(F.col("center_latitude").isNotNull() & F.col("center_longitude").isNotNull())
    )

@dp.materialized_view(
    comment="Calculates distance in kilometers from each facility to all district centers within 160km"
)
def facility_district_distances():
    """Cross-join facilities with all district centers and calculate distances within 160km"""
    
    facilities = (
        spark.read.table("databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities")
        .filter(F.col("latitude").isNotNull() & F.col("longitude").isNotNull())
        .select(
            "unique_id",
            "name",
            "address_city",
            "address_stateOrRegion",
            F.col("latitude").alias("facility_latitude"),
            F.col("longitude").alias("facility_longitude")
        )
    )
    
    centers = spark.read.table("district_centers")
    
    # Cross join facilities with all district centers
    joined = facilities.crossJoin(centers)
    
    # Calculate spherical distance in kilometers and filter to 160km threshold
    return joined.withColumn(
        "distance_kilometers",
        F.expr("""
            ST_DistanceSphere(
                ST_Point(facility_longitude, facility_latitude),
                ST_Point(center_longitude, center_latitude)
            ) / 1000
        """)
    ).filter(
        F.col("distance_kilometers") <= 160
    ).select(
        "unique_id",
        "name",
        "address_city",
        "address_stateOrRegion",
        "facility_latitude",
        "facility_longitude",
        "district",
        "statename",
        "center_latitude",
        "center_longitude",
        "distance_kilometers",
        "office_count"
    ).orderBy("unique_id", "distance_kilometers")
