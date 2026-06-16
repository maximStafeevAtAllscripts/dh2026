from pyspark import pipelines as dp

@dp.materialized_view(
    comment="Raw NFHS-5 district health indicators data"
)
def nfhs_raw():
    return spark.read.table("workspace.raw_data.nfhs_5_district_health_indicators")
