"""
Budget Killer Lambda — Emergency cost control for mcp-server.

Triggered via SNS when AWS Budget exceeds the threshold.
Scales ECS services to 0 and cleans up resources.
"""

import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE = os.environ.get("SERVICE", "mcp-server")
REGION = os.environ.get("AWS_REGION_", "eu-west-1")


def lambda_handler(event: dict, context: object) -> dict:
    """SNS-triggered handler that kills all project resources."""
    logger.info("🚨 Budget killer triggered! Event: %s", json.dumps(event))

    killed: list[str] = []
    killed.extend(_kill_ecs(SERVICE))

    summary = {
        "status": "resources_killed",
        "service": SERVICE,
        "killed_count": len(killed),
        "killed_resources": killed,
    }
    logger.info("💀 Kill summary: %s", json.dumps(summary))
    return summary


def _kill_ecs(prefix: str) -> list[str]:
    """Scale all ECS services to 0."""
    killed = []
    ecs = boto3.client("ecs", region_name=REGION)
    try:
        for cluster_arn in ecs.list_clusters()["clusterArns"]:
            if prefix not in cluster_arn:
                continue
            for svc in ecs.list_services(cluster=cluster_arn)["serviceArns"]:
                ecs.update_service(cluster=cluster_arn, service=svc, desiredCount=0)
                killed.append(f"ecs:scaled-to-0:{svc}")
    except Exception:
        logger.exception("Error killing ECS")
    return killed
