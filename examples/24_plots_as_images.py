"""Plots as Images

Examples of sending plots as images to Viser's GUI panel. This can be faster
than using Plotly."""

import time

import cv2
import numpy as np
import tyro
import viser


def get_line_plot(
    x: np.ndarray,
    y: np.ndarray,
    height: int,
    width: int,
    *,
    x_bounds: tuple[float, float] | None = None,
    y_bounds: tuple[float, float] | None = None,
    line_thickness: int = 2,
    font_scale: float = 0.4,
    background_color: tuple[int, int, int] = (0, 0, 0),
    plot_area_color: tuple[int, int, int] = (0, 0, 0),
    grid_color: tuple[int, int, int] = (60, 60, 60),
    axes_color: tuple[int, int, int] = (100, 100, 100),
    line_color: tuple[int, int, int] = (0, 255, 255),
    text_color: tuple[int, int, int] = (200, 200, 200),
) -> np.ndarray:
    """Create a line plot using OpenCV with axes, labels, and grid.

    This is much faster than using libraries like Matplotlib or Plotly, but is
    less flexible.
    """

    if x_bounds is None:
        x_bounds = (np.min(x), np.max(x.round(decimals=4)))
    if y_bounds is None:
        y_bounds = (np.min(y), np.max(y))

    # Calculate text sizes for padding.
    font = cv2.FONT_HERSHEY_SIMPLEX
    sample_y_label = f"{max(abs(y_bounds[0]), abs(y_bounds[1])):.1f}"
    y_text_size = cv2.getTextSize(sample_y_label, font, font_scale, 1)[0]

    sample_x_label = f"{max(abs(x_bounds[0]), abs(x_bounds[1])):.1f}"
    x_text_size = cv2.getTextSize(sample_x_label, font, font_scale, 1)[0]

    # Define padding based on font scale.
    extra_padding = 8
    left_pad = int(y_text_size[0] * 1.5) + extra_padding  # Space for y-axis labels
    right_pad = int(10 * font_scale) + extra_padding
    top_pad = int(20 * font_scale) + extra_padding
    bottom_pad = int(x_text_size[1] * 2.0) + extra_padding  # Space for x-axis labels

    # Create larger image to accommodate padding.
    total_height = height
    total_width = width
    plot_width = width - left_pad - right_pad
    plot_height = height - top_pad - bottom_pad
    assert plot_width > 0 and plot_height > 0

    # Create image with specified background color
    img = np.ones((total_height, total_width, 3), dtype=np.uint8)
    img[:] = background_color

    # Create plot area with specified color
    plot_area = np.ones((plot_height, plot_width, 3), dtype=np.uint8)
    plot_area[:] = plot_area_color
    img[top_pad : top_pad + plot_height, left_pad : left_pad + plot_width] = plot_area

    def scale_to_pixels(values, bounds, pixels):
        """Scale values from bounds range to pixel coordinates."""
        min_val, max_val = bounds
        normalized = (values - min_val) / (max_val - min_val)
        return (normalized * (pixels - 1)).astype(np.int32)

    # Draw grid lines.

    num_vertical_lines = 5
    num_horizontal_lines = 3

    # Vertical grid lines.
    for i in range(num_vertical_lines):
        x_pos = left_pad + int(plot_width * i / (num_vertical_lines - 1))
        cv2.line(img, (x_pos, top_pad), (x_pos, top_pad + plot_height), grid_color, 1)

    # Horizontal grid lines.
    for i in range(num_horizontal_lines):
        y_pos = top_pad + int(plot_height * i / (num_horizontal_lines - 1))
        cv2.line(img, (left_pad, y_pos), (left_pad + plot_width, y_pos), grid_color, 1)

    # Draw axes.
    cv2.line(
        img,
        (left_pad, top_pad + plot_height),
        (left_pad + plot_width, top_pad + plot_height),
        axes_color,
        1,
    )  # x-axis
    cv2.line(
        img, (left_pad, top_pad), (left_pad, top_pad + plot_height), axes_color, 1
    )  # y-axis

    # Scale and plot the data.
    x_scaled = scale_to_pixels(x, x_bounds, plot_width) + left_pad
    y_scaled = top_pad + plot_height - 1 - scale_to_pixels(y, y_bounds, plot_height)
    pts = np.column_stack((x_scaled, y_scaled)).reshape((-1, 1, 2))

    # Draw the main plot line.
    cv2.polylines(
        img, [pts], False, line_color, thickness=line_thickness, lineType=cv2.LINE_AA
    )

    # Add labels.
    font = cv2.FONT_HERSHEY_SIMPLEX

    # X-axis labels.
    for i in range(num_vertical_lines):
        x_val = x_bounds[0] + (x_bounds[1] - x_bounds[0]) * i / (num_vertical_lines - 1)
        x_pos = left_pad + int(plot_width * i / (num_vertical_lines - 1))
        label = f"{x_val:.1f}"
        if label == "-0.0":
            label = "0.0"
        text_size = cv2.getTextSize(label, font, font_scale, 1)[0]
        cv2.putText(
            img,
            label,
            (x_pos - text_size[0] // 2, top_pad + plot_height + text_size[1] + 10),
            font,
            font_scale,
            text_color,
            1,
            cv2.LINE_AA,
        )

    # Y-axis labels.
    for i in range(num_horizontal_lines):
        y_val = y_bounds[0] + (y_bounds[1] - y_bounds[0]) * (
            num_horizontal_lines - 1 - i
        ) / (num_horizontal_lines - 1)
        y_pos = top_pad + int(plot_height * i / (num_horizontal_lines - 1))
        label = f"{y_val:.1f}"
        if label == "-0.0":
            label = "0.0"
        text_size = cv2.getTextSize(label, font, font_scale, 1)[0]
        cv2.putText(
            img,
            label,
            (left_pad - text_size[0] - 5, y_pos + 5),
            font,
            font_scale,
            text_color,
            1,
            cv2.LINE_AA,
        )

    return img


def create_sine_plot(counter: int) -> np.ndarray:
    """Create a sine wave plot with the given counter offset."""
    xs = np.linspace(0, 2 * np.pi, 50)
    return get_line_plot(
        xs,
        np.sin(xs + counter / 20),
        height=150,
        width=350,
    )


def main(num_plots: int = 4) -> None:
    server = viser.ViserServer()

    with server.gui.add_folder("Runtime"):
        draw_time = server.gui.add_text("Draw / plot (ms)", "0.00")
        send_time = server.gui.add_text("Send / plot (ms)", "0.00")

    with server.gui.add_folder("Plots"):
        image_handles = [
            server.gui.add_image(
                create_sine_plot(counter=0),
                label=f"Plot {i}",
                format="jpeg",
            )
            for i in range(num_plots)
        ]

    counter = 0

    while True:
        # Create and time the plot generation
        start = time.time()
        images = [create_sine_plot(counter=counter * (i + 1)) for i in range(num_plots)]
        draw_time.value = f"{(time.time() - start) / num_plots * 1000:.2f}"

        # Update all plot images
        start = time.time()
        for i, handle in enumerate(image_handles):
            handle.image = images[i]
        send_time.value = f"{(time.time() - start) / num_plots * 1000:.2f}"

        # Sleep a bit before continuing.
        time.sleep(0.01)
        counter += 1


if __name__ == "__main__":
    tyro.cli(main)
