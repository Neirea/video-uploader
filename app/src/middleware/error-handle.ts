import type { NextFunction, Request, Response } from "express";

const errorHandlerMiddleware = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // set default error
    const customError = {
        statusCode: err.statusCode || 500,
        message: err.message,
    };

    console.log(err);

    return res
        .status(customError.statusCode)
        .json({ message: customError.message });
};

export default errorHandlerMiddleware;
