import express from "express";
import { auth } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import BotSubscription from "../models/BotSubscription";
import Bot from "../models/Bot";
import validate from "../middleware/validate";
import { body, query } from "express-validator";
import * as SubscriptionController from "../controllers/subscriptionController";

const router = express.Router();

// All subscription routes require authentication
router.use(auth);

/**
 * @route POST /api/subscriptions
 * @desc Subscribe to a bot
 * @access Private
 */
router.post(
  "/",
  body("botId")
    .notEmpty()
    .withMessage("Bot ID is required")
    .isMongoId()
    .withMessage("botId should be valid MongoDB ID."),
  body("botPackageId")
    .notEmpty()
    .withMessage("Bot Package ID is required")
    .isMongoId()
    .withMessage("botPackageId should be valid MongoDB ID."),
  body("lotSize").notEmpty().withMessage("Lot Size is required"),
  body("lotSize")
    .isFloat({ min: 0.01 })
    .withMessage("Lot Size must be at least 0.01"),
  validate,
  SubscriptionController.createSubscription
);

/**
 * @route GET /api/subscriptions
 * @desc Get user's subscriptions
 * @access Private
 */
router.get(
  "/",
  query("status")
    .optional()
    .isIn(["active", "cancelled", "pending"])
    .withMessage("Status must be one of 'active', 'cancelled', or 'pending'"),
  validate,
  SubscriptionController.getUserSubscriptions
);

/**
 * @route GET /api/subscriptions/:id
 * @desc Get specific subscription
 * @access Private
 */
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const subscription = await BotSubscription.findOne({
      _id: id,
      userId: req.user._id,
    })
      .populate(
        "bot",
        "name description recommendedCapital performanceDuration script"
      )
      .select("-__v");

    if (!subscription) {
      throw new AppError(
        "Subscription not found",
        404,
        "subscription-not-found"
      );
    }

    res.status(200).json({
      status: "success",
      data: subscription,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/subscriptions/:id
 * @desc Update a subscription (status, lotSize, etc.)
 * @access Private
 */
router.put(
  "/:id",
  body("status")
    .optional()
    .isIn(["active", "pause", "expired"])
    .withMessage("Status must be one of 'active', 'pause', or 'expired'"),
  body("lotSize")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Lot Size must be a number >= 0.01"),
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, lotSize } = req.body;

      const subscription = await BotSubscription.findOne({
        _id: id,
        userId: req.user._id,
      });

      if (!subscription) {
        throw new AppError("Subscription not found", 404, "subscription-not-found");
      }

        type SubscriptionUpdateFields = {
        status?: string;
        lotSize?: number;
      };
  
      const updateFields: SubscriptionUpdateFields = {};
      if (status) updateFields.status = status;
      if (lotSize) updateFields.lotSize = lotSize;

      const updatedSubscription = await BotSubscription.findByIdAndUpdate(
        id,
        updateFields,
        { new: true }
      );

      const transformed = {
        ...updatedSubscription!.toObject(),
        id: updatedSubscription!._id,
      };
      delete transformed._id;
      delete (transformed as any).__v;
      
      res.status(200).json({
        status: "success",
        message: "Subscription updated successfully",
        data: transformed,
      });
    } catch (err) {
      next(err);
    }
  }
);


/**
 * @route GET /api/subscriptions/check/:botId
 * @desc Check if user is subscribed to a specific bot
 * @access Private
 */
router.get("/check/:botId", async (req, res, next) => {
  try {
    const { botId } = req.params;

    // Check if bot exists
    const bot = await Bot.findById(botId);
    if (!bot) {
      throw new AppError("Bot not found", 404, "bot-not-found");
    }

    // Check if user is subscribed to this bot
    const subscription = await BotSubscription.findOne({
      userId: req.user._id,
      botId: botId,
    });

    const isSubscribed = Boolean(
      subscription && subscription.status === "active"
    );

    res.status(200).json({
      status: "success",
      data: {
        botId: botId,
        isSubscribed: isSubscribed,
        subscription: subscription
          ? {
              id: subscription._id,
              status: subscription.status,
              subscribedAt: subscription.subscribedAt,
              cancelledAt: subscription.cancelledAt,
              botPackageId: subscription.botPackageId,
              lotSize: subscription.lotSize,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/subscriptions/:id
 * @desc Delete a subscription (permanent removal)
 * @access Private
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const subscription = await BotSubscription.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    });

    if (!subscription) {
      throw new AppError(
        "Subscription not found",
        404,
        "subscription-not-found"
      );
    }

    res.status(200).json({
      status: "success",
      message: "Subscription deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
