"""grading 算法单元测试。

阈值规则（v0.2 起）：
- value < critical_low                  → low
- value >= critical_high                → vhigh
- value < target_low                    → low
- target_low <= value <= target_high    → ideal
- target_high < value <= target_high*1.3 → ok
- target_high*1.3 < value < critical_high → high
"""
import pytest

from app.models import Family
from app.services.grading import grade


@pytest.fixture
def std() -> Family:
    return Family(
        name="t",
        invite_code="X",
        fasting_low=4.4,
        fasting_high=6.1,
        postprandial_low=4.4,
        postprandial_high=7.8,
        critical_low=3.9,
        critical_high=13.9,
    )


@pytest.mark.parametrize(
    "value,period,expected",
    [
        (3.5, "fasting", "low"),
        (4.4, "fasting", "ideal"),
        (5.5, "fasting", "ideal"),
        (6.1, "fasting", "ideal"),
        (6.5, "fasting", "ok"),
        (7.9, "fasting", "ok"),
        (7.94, "fasting", "high"),
        (8.0, "fasting", "high"),
        (11.5, "fasting", "high"),
        (13.9, "fasting", "vhigh"),
        (15.0, "fasting", "vhigh"),
        (4.0, "after_breakfast", "low"),
        (7.8, "after_breakfast", "ideal"),
        (8.5, "after_breakfast", "ok"),
        (10.14, "after_breakfast", "ok"),
        (10.15, "after_breakfast", "high"),
        (12.0, "after_breakfast", "high"),
    ],
)
def test_grade(std: Family, value: float, period: str, expected: str) -> None:
    assert grade(value, period, std).value == expected
