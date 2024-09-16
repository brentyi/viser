from __future__ import annotations

import dataclasses
from typing import Tuple

import numpy as onp
import numpy.typing as onpt
from typing_extensions import override

from . import _base, hints
from .utils import broadcast_leading_axes


@dataclasses.dataclass(frozen=True)
class SO2(
    _base.SOBase,
    matrix_dim=2,
    parameters_dim=2,
    tangent_dim=1,
    space_dim=2,
):
    """Special orthogonal group for 2D rotations. Broadcasting rules are the
    same as for numpy.

    Ported to numpy from `jaxlie.SO2`.

    Internal parameterization is `(cos, sin)`. Tangent parameterization is `(omega,)`.
    """

    # SO2-specific.

    unit_complex: onpt.NDArray[onp.floating]
    """Internal parameters. `(cos, sin)`. Shape should be `(*, 2)`."""

    @override
    def __repr__(self) -> str:
        unit_complex = onp.round(self.unit_complex, 5)
        return f"{self.__class__.__name__}(unit_complex={unit_complex})"

    @staticmethod
    def from_radians(theta: hints.Scalar) -> SO2:
        """Construct a rotation object from a scalar angle."""
        cos = onp.cos(theta)
        sin = onp.sin(theta)
        return SO2(unit_complex=onp.stack([cos, sin], axis=-1))

    def as_radians(self) -> onpt.NDArray[onp.floating]:
        """Compute a scalar angle from a rotation object."""
        radians = self.log()[..., 0]
        return radians

    # Factory.

    @classmethod
    @override
    def identity(
        cls, batch_axes: Tuple[int, ...] = (), dtype: onpt.DTypeLike = onp.float64
    ) -> SO2:
        return SO2(
            unit_complex=onp.stack(
                [onp.ones(batch_axes, dtype=dtype), onp.zeros(batch_axes, dtype=dtype)],
                axis=-1,
            )
        )

    @classmethod
    @override
    def from_matrix(cls, matrix: onpt.NDArray[onp.floating]) -> SO2:
        assert matrix.shape[-2:] == (2, 2)
        return SO2(unit_complex=onp.array(matrix[..., :, 0]))

    # Accessors.

    @override
    def as_matrix(self) -> onpt.NDArray[onp.floating]:
        cos_sin = self.unit_complex
        out = onp.stack(
            [
                # [cos, -sin],
                cos_sin * onp.array([1, -1], dtype=cos_sin.dtype),
                # [sin, cos],
                cos_sin[..., ::-1],
            ],
            axis=-2,
        )
        assert out.shape == (*self.get_batch_axes(), 2, 2)
        return out  # type: ignore

    @override
    def parameters(self) -> onpt.NDArray[onp.floating]:
        return self.unit_complex

    # Operations.

    @override
    def apply(self, target: onpt.NDArray[onp.floating]) -> onpt.NDArray[onp.floating]:
        assert target.shape[-1:] == (2,)
        self, target = broadcast_leading_axes((self, target))
        return onp.einsum("...ij,...j->...i", self.as_matrix(), target)

    @override
    def multiply(self, other: SO2) -> SO2:
        return SO2(
            unit_complex=onp.einsum(
                "...ij,...j->...i", self.as_matrix(), other.unit_complex
            )
        )

    @classmethod
    @override
    def exp(cls, tangent: onpt.NDArray[onp.floating]) -> SO2:
        assert tangent.shape[-1] == 1
        cos = onp.cos(tangent)
        sin = onp.sin(tangent)
        return SO2(unit_complex=onp.concatenate([cos, sin], axis=-1))

    @override
    def log(self) -> onpt.NDArray[onp.floating]:
        return onp.arctan2(
            self.unit_complex[..., 1, None], self.unit_complex[..., 0, None]
        )

    @override
    def adjoint(self) -> onpt.NDArray[onp.floating]:
        return onp.ones((*self.get_batch_axes(), 1, 1), dtype=self.unit_complex.dtype)

    @override
    def inverse(self) -> SO2:
        unit_complex = self.unit_complex.copy()
        unit_complex[..., 1] *= -1
        return SO2(unit_complex)

    @override
    def normalize(self) -> SO2:
        return SO2(
            unit_complex=self.unit_complex
            / onp.linalg.norm(self.unit_complex, axis=-1, keepdims=True)
        )

    @classmethod
    @override
    def sample_uniform(
        cls,
        rng: onp.random.Generator,
        batch_axes: Tuple[int, ...] = (),
        dtype: onpt.DTypeLike = onp.float64,
    ) -> SO2:
        out = SO2.from_radians(
            rng.uniform(0.0, 2.0 * onp.pi, size=batch_axes).astype(dtype=dtype)
        )
        assert out.get_batch_axes() == batch_axes
        return out
