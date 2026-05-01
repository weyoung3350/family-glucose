"""extract_value 中文数字识别测试。"""
import pytest

from app.services.ai_parser import extract_value, cn_to_float, cn_to_int


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("十二", 12),
        ("十", 10),
        ("二十一", 21),
        ("二十二", 22),
        ("三", 3),
        ("二十三", 23),
        ("三十", 30),
        ("两", 2),
    ],
)
def test_cn_to_int(raw: str, expected: int) -> None:
    assert cn_to_int(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("七点八", 7.8),
        ("十二点五", 12.5),
        ("十二", 12.0),
        ("二十二点三", 22.3),
    ],
)
def test_cn_to_float(raw: str, expected: float) -> None:
    assert cn_to_float(raw) == pytest.approx(expected)


@pytest.mark.parametrize(
    "text,expected",
    [
        ("晚上八点血糖十二", 12.0),
        ("血糖七点八", 7.8),
        ("血糖二十二", 22.0),
        ("血糖 7.5", 7.5),
        ("早上 9:20 空腹血糖 11.1", 11.1),
        ("晚上八点", None),  # 仅时间，不应误识别 8 为血糖
        ("十二点", None),    # 单独时间表达，不应当血糖
        ("血糖三", None),    # 3 不在 4-30 范围
    ],
)
def test_extract_value(text: str, expected) -> None:
    value, _ = extract_value(text)
    assert value == expected
