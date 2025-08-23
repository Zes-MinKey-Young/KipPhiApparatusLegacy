type PositionEntity<T> = {
    target: T;
    left: number;
    top: number;
    height: number;
    width: number;
    priority: number;
} | {
    target: T;
    centerX: number;
    centerY: number;
    height: number;
    width: number;
    priority: number;
    rad?: number;
}


const pointIsInRect = (x: number, y: number, rectTop: number, rectLeft: number, width: number, height: number) => rectLeft <= x && x <= rectLeft + width 
&& rectTop <= y && y <= rectTop + height

class SelectionManager<T> {
    positions: PositionEntity<T>[];
    private basePriority = 0;
    constructor() {

    }
    refresh() {
        this.positions = []
    }
    /**
     * 
     * @param entity 两种形态，一种通过左上角和宽高定义，需要选定区罩住整个矩形，另一种通过中心点、宽高和角度定义，只要罩住中心点
     * @returns 
     */
    add(entity: PositionEntity<T>) {
        entity.priority += this.basePriority
        this.positions.push(entity)
        return {
            annotate: (context: CanvasRenderingContext2D, canvasX: number, canvasY: number) => {
                context.save();
                context.fillStyle = "pink";
                context.fillText(`${shortenFloat(entity.left || entity.centerX, 1)}, ${shortenFloat(entity.top || entity.centerY, 1)}`, canvasX, canvasY - 10);
                context.restore();
            },
        }
    }
    click(Coordinate: Coordinate): undefined | PositionEntity<T>;
    click(x: number, y: number): undefined | PositionEntity<T>;
    click(x: number | Coordinate, y?: number): undefined | PositionEntity<T> {
        if (typeof x !== "number") {
            return this.click(x.x, x.y);
        }
        const positions = this.positions;
        // console.log(positions, x, y)
        const len = positions.length;
        let i = 0;
        let selected: PositionEntity<T>, priority = -1;
        for (; i < len; i++) {
            const pos = positions[i];
            if ("centerX" in pos) {
                const dx = x - pos.centerX;
                const dy = y - pos.centerY;
                const theta = pos.rad || 0;
                // dx dy 顺时针转rad，判断绝对值与半宽高的关系，均小于则在旋转矩形内
                const rx = Math.abs(theta ? dx * Math.cos(theta) + dy * Math.sin(theta) : dx);
                const ry = Math.abs(theta ? dx * -Math.sin(theta) + dy * Math.cos(theta) : dy);
                if (rx < pos.width / 2 && ry < pos.height / 2 && pos.priority > priority) {
                    selected = pos;
                    priority = pos.priority;
                }
            } else {
                if (pointIsInRect(x, y, pos.top, pos.left, pos.width, pos.height)) {
                    if (pos.priority > priority) {
                        selected = pos;
                        priority = pos.priority
                    }
                }
            }
        }
        return selected;
    }
    /**
     * For PositionEntities whose centerXY is given, this method only examine whether the center is in the rect.
     * For PositionEntities whose left, top is given, this method also examine whether the pos rect is in the rect.
     * @param top 
     * @param left 
     * @param right 
     * @param bottom 
     * @returns 
     */
    selectScope(top: number, left: number, bottom: number, right: number) {
        return this.positions.filter(pos => {
            if ("centerX" in pos) {
                console.log(left, pos.centerX, right);
                console.log(top, pos.centerY, bottom);
                return pos.centerX >= left && pos.centerX <= right && pos.centerY >= top && pos.centerY <= bottom;
            } else {
                return pos.left >= left && pos.left + pos.width <= right
                    && pos.top >= top && pos.top + pos.height <= bottom;
            }
        })
    }
    setBasePriority(priority: number) {
        this.basePriority = priority;
    }
}
