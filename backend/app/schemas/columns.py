from typing import Literal

from pydantic import BaseModel

# Ordre d'inclusion : un booléen 0/1 est aussi un entier, un entier aussi un décimal,
# et tout s'écrit en texte. La détection retient le type le plus précis.
ColumnType = Literal["boolean", "integer", "float", "string"]


class ColumnOut(BaseModel):
    label: str
    key: str
    type: ColumnType
