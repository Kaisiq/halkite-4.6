"""Shared test fixtures for the Halkantir API test suite."""

from __future__ import annotations

import pytest

from nexus_api.models.graph import Edge, Graph, Node


@pytest.fixture
def small_graph() -> Graph:
    """4-node graph for fast unit tests.

    Topology::

        CEO --(0.7)--> CTO --(0.8)--> Server
         |                                |
         `--(0.5)--> Dev <----(0.6)-------'

    Layers: People, Technology
    """
    nodes = [
        Node("ceo", "CEO", "People", theta=0.9, r=180),
        Node("cto", "CTO", "People", theta=0.7, r=120),
        Node("server", "Main Server", "Technology", theta=0.8, r=1),
        Node("dev", "Dev Team", "People", theta=0.4, r=30),
    ]
    edges = [
        Edge("ceo", "cto", 0.7),
        Edge("ceo", "dev", 0.5),
        Edge("cto", "server", 0.8),
        Edge("server", "dev", 0.6),
    ]
    return Graph(nodes=nodes, edges=edges, layers=["People", "Technology"])


@pytest.fixture
def medium_graph() -> Graph:
    """6-node, 4-layer graph for more thorough tests.

    Adds Supply and Facilities layers to the small graph.
    """
    nodes = [
        Node("ceo", "CEO", "People", theta=0.9, r=180),
        Node("cto", "CTO", "People", theta=0.7, r=120),
        Node("server", "Main Server", "Technology", theta=0.8, r=1),
        Node("dev", "Dev Team", "People", theta=0.4, r=30),
        Node("supplier", "Main Supplier", "Supply", theta=0.6, r=60),
        Node("office", "HQ Office", "Facilities", theta=0.3, r=365),
    ]
    edges = [
        Edge("ceo", "cto", 0.7),
        Edge("ceo", "dev", 0.5),
        Edge("cto", "server", 0.8),
        Edge("server", "dev", 0.6),
        Edge("supplier", "office", 0.4),
        Edge("office", "dev", 0.3),
        Edge("cto", "supplier", 0.2),
    ]
    return Graph(
        nodes=nodes,
        edges=edges,
        layers=["People", "Technology", "Supply", "Facilities"],
    )
