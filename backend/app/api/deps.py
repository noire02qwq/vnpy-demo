# app/api/deps.py
"""路由依赖:请求期解析 ``app.main.get_session_factory``(测试可 monkeypatch 注入 tmp 库)。

不把 ``app.main.get_session_factory`` 在导入期 ``from ... import`` 进 Depends:导入期捕获的
函数引用会绕过 monkeypatch;经模块属性在每次请求时解析,替换 ``app.main.get_session_factory``
即对全部路由生效。
"""
from sqlalchemy.orm import Session, sessionmaker


def resolve_session_factory() -> sessionmaker[Session]:
    """返回当前生效的 session factory(延迟导入规避装配期循环引用)。"""
    from app import main

    return main.get_session_factory()
